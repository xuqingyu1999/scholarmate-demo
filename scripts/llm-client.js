(function (global) {
    'use strict';

    const CONFIG_KEY = 'scholarmate_llm_config_session';

    function normalizeBaseURL(baseURL) {
        return String(baseURL || '').trim().replace(/\/+$/, '');
    }

    function getConfig() {
        try {
            const raw = global.sessionStorage && global.sessionStorage.getItem(CONFIG_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch (error) {
            console.warn('Failed to read LLM config');
            return null;
        }
    }

    function saveSessionConfig(config) {
        const next = {
            baseURL: normalizeBaseURL(config.baseURL),
            apiKey: String(config.apiKey || '').trim(),
            model: String(config.model || '').trim()
        };
        global.sessionStorage.setItem(CONFIG_KEY, JSON.stringify(next));
        return next;
    }

    function clearConfig() {
        if (global.sessionStorage) global.sessionStorage.removeItem(CONFIG_KEY);
    }

    function isConfigured(config = getConfig()) {
        return !!(config && config.baseURL && config.apiKey && config.model);
    }

    function parseContent(payload) {
        const content = payload && payload.choices && payload.choices[0] && payload.choices[0].message && payload.choices[0].message.content;
        if (!content) throw new Error('模型响应格式异常：未找到 choices[0].message.content');
        return String(content);
    }

    function safeErrorMessage(error) {
        const message = String(error && error.message || error || '');
        if (/401|unauthorized|invalid[_\s-]?api|api[_\s-]?key|bad key/i.test(message)) {
            return '认证失败，请检查 API key 是否有效。';
        }
        if (/network|fetch|cors|failed to fetch|load failed/i.test(message)) {
            return '网络或 CORS 请求失败，请检查 baseURL 是否允许浏览器访问。';
        }
        if (/格式异常|choices|message\.content/i.test(message)) {
            return '模型响应格式异常，请确认接口兼容 OpenAI Chat Completions。';
        }
        if (/LLM 请求失败/.test(message)) {
            return '模型接口返回错误，请检查 baseURL、model 和服务状态。';
        }
        return '请求失败，请检查模型配置和网络状态。';
    }

    async function sendChat({ config, messages }) {
        const activeConfig = config || getConfig();
        if (!isConfigured(activeConfig)) {
            throw new Error('请先填写演示模式的大模型 baseURL、API key 和 model');
        }
        const response = await global.fetch(`${normalizeBaseURL(activeConfig.baseURL)}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${activeConfig.apiKey}`
            },
            body: JSON.stringify({
                model: activeConfig.model,
                messages,
                temperature: 0.4,
                stream: false
            })
        });

        let payload = null;
        try {
            payload = await response.json();
        } catch (error) {
            payload = null;
        }

        if (!response.ok) {
            throw new Error(`LLM 请求失败 ${response.status} ${response.statusText}`);
        }

        return parseContent(payload);
    }

    function composeSystemPrompt(context = {}) {
        const inventor = context.inventor || {};
        const patent = context.patent || {};
        const project = context.project || null;
        const user = context.user || {};
        return [
            `你是 ScholarMate 的数字技术顾问，当前数字人是${inventor.name || '数字发明人'}。`,
            '你要用企业用户能理解的语言回答，不夸大，不把资料/对话许可说成法律授权。',
            `当前专利：${patent.title || '未指定'}；技术领域：${patent.field || patent.industry || '未指定'}。`,
            project ? `企业需求项目：${project.title}；行业：${project.industry || '未指定'}；阶段：${project.stage || '未指定'}；预算：${project.budget || '未指定'}；需求：${project.description || ''}` : '当前没有绑定技术需求项目，回答时提醒用户可以先创建需求项目以获得更准确建议。',
            `企业用户：${user.companyName || user.name || '未命名企业'}。`,
            '每次回答都覆盖：专利价值、匹配度、落地门槛/风险、建议下一步。结尾优先引导提交交易意向或补充需求信息。'
        ].join('\n');
    }

    function buildAdvisorMessages({ inventor, patent, project, user, history = [], question }) {
        const messages = [{ role: 'system', content: composeSystemPrompt({ inventor, patent, project, user }) }];
        history.slice(-12).forEach(message => {
            if (message.role === 'user' || message.role === 'assistant') {
                messages.push({ role: message.role, content: message.content });
            } else if (message.role === 'ai') {
                messages.push({ role: 'assistant', content: message.content });
            }
        });
        if (question) messages.push({ role: 'user', content: question });
        return messages;
    }

    async function sendAdvisorChat(options) {
        return sendChat({
            config: options.config,
            messages: buildAdvisorMessages(options)
        });
    }

    global.LlmClient = {
        CONFIG_KEY,
        getConfig,
        saveSessionConfig,
        clearConfig,
        isConfigured,
        safeErrorMessage,
        sendChat,
        composeSystemPrompt,
        buildAdvisorMessages,
        sendAdvisorChat
    };
})(typeof globalThis !== 'undefined' ? globalThis : window);
