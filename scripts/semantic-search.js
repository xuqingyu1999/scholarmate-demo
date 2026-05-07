(function (global) {
    'use strict';

    const MODEL_ID = 'Xenova/multilingual-e5-small';
    const MODEL_VERSION = 'semantic-v2';
    const TRANSFORMERS_URL = 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2';
    const MODEL_TIMEOUT_MS = 12000;

    let extractorPromise = null;
    let lastStatus = { status: 'idle', notice: '' };

    function buildPatentDocument(patent) {
        return [
            patent.title,
            patent.field,
            patent.industry,
            patent.summary,
            patent.keywords && patent.keywords.join(' '),
            patent.tags && patent.tags.join(' '),
            patent.applicationScenario,
            patent.risks && patent.risks.join(' '),
            patent.inventorExpertise && patent.inventorExpertise.join(' ')
        ].filter(Boolean).join(' ');
    }

    function hashText(text) {
        let hash = 2166136261;
        for (let i = 0; i < text.length; i += 1) {
            hash ^= text.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
        }
        return (hash >>> 0).toString(36);
    }

    function cacheKey(patent) {
        const text = buildPatentDocument(patent);
        return `scholarmate_embedding_${MODEL_VERSION}_${MODEL_ID}_${patent.id}_${hashText(text)}`;
    }

    function normalizeVector(vector) {
        const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
        return vector.map(value => value / norm);
    }

    function cosine(a, b) {
        const len = Math.min(a.length, b.length);
        let sum = 0;
        for (let i = 0; i < len; i++) sum += a[i] * b[i];
        return Math.max(0, Math.min(1, (sum + 1) / 2));
    }

    function withTimeout(promise, ms, message) {
        let timeoutId;
        const timeoutPromise = new Promise((_, reject) => {
            timeoutId = global.setTimeout(() => reject(new Error(message)), ms);
        });
        return Promise.race([promise, timeoutPromise]).finally(() => global.clearTimeout(timeoutId));
    }

    function importTransformers() {
        if (typeof global.__ScholarMateTransformersImport === 'function') {
            return global.__ScholarMateTransformersImport(TRANSFORMERS_URL);
        }
        return import(TRANSFORMERS_URL);
    }

    function classifyError(error) {
        const message = String(error && error.message || error || '');
        if (/timed out|timeout|超时/i.test(message)) {
            return {
                code: 'timeout',
                notice: '语义模型下载超时，已回退到本地规则推荐。可稍后重试。'
            };
        }
        if (/fetch|network|failed to fetch|load failed|ERR_/i.test(message)) {
            return {
                code: 'network',
                notice: '语义模型网络不可达，已回退到本地规则推荐。请确认能访问 jsDelivr 和 Hugging Face。'
            };
        }
        return {
            code: 'failed',
            notice: '语义模型加载失败，已回退到本地规则推荐。'
        };
    }

    async function getExtractor() {
        if (extractorPromise) return extractorPromise;
        lastStatus = { status: 'loading', notice: '正在下载语义推荐模型...' };
        extractorPromise = withTimeout(
            importTransformers().then(module => module.pipeline('feature-extraction', MODEL_ID)),
            MODEL_TIMEOUT_MS,
            'Semantic model load timed out'
        );
        return extractorPromise;
    }

    function retry() {
        extractorPromise = null;
        lastStatus = { status: 'retrying', notice: '正在重新加载语义推荐模型...' };
        return lastStatus;
    }

    async function embedText(text) {
        const extractor = await getExtractor();
        const output = await extractor(text, { pooling: 'mean', normalize: true });
        const data = Array.from(output.data || output.tolist()[0] || []);
        return normalizeVector(data);
    }

    async function embedPatent(patent) {
        const key = cacheKey(patent);
        const cached = global.localStorage && global.localStorage.getItem(key);
        if (cached) return JSON.parse(cached);
        const vector = await embedText(`passage: ${buildPatentDocument(patent)}`);
        if (global.localStorage) {
            try {
                global.localStorage.setItem(key, JSON.stringify(vector));
            } catch (e) {
                console.warn('Embedding cache skipped:', e);
            }
        }
        return vector;
    }

    async function rank(options) {
        const query = options.query || '';
        const patents = options.patents || [];
        const project = options.project || null;
        const user = options.user || null;

        if (options.forceFallback || !query.trim()) {
            return {
                usedSemanticModel: false,
                notice: options.forceFallback ? '语义模型不可用，已回退到本地规则推荐。' : '',
                items: global.ScholarMateBusinessCore.rankPatentsHybrid({ query, project, patents, user })
            };
        }

        try {
            const queryVector = await embedText(`query: ${query}`);
            const semanticScores = {};
            for (const patent of patents) {
                const patentVector = await embedPatent(patent);
                semanticScores[patent.id] = cosine(queryVector, patentVector);
            }
            lastStatus = { status: 'ready', notice: '已使用本地语义推荐模型。' };
            return {
                usedSemanticModel: true,
                notice: lastStatus.notice,
                items: global.ScholarMateBusinessCore.rankPatentsHybrid({ query, project, patents, user, semanticScores })
            };
        } catch (error) {
            console.warn('Semantic search fallback:', error);
            const failure = classifyError(error);
            lastStatus = { status: failure.code, notice: failure.notice };
            return {
                usedSemanticModel: false,
                notice: failure.notice,
                failureReason: failure.code,
                retryable: true,
                items: global.ScholarMateBusinessCore.rankPatentsHybrid({ query, project, patents, user })
            };
        }
    }

    global.ScholarMateSemanticSearch = {
        MODEL_ID,
        buildPatentDocument,
        cacheKey,
        retry,
        getStatus: () => lastStatus,
        rank
    };
})(typeof globalThis !== 'undefined' ? globalThis : window);
