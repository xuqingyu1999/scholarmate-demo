(function (global) {
    'use strict';

    const MEMBERSHIP_PLANS = {
        free: {
            level: 'free',
            name: '免费认证版',
            price: '免费',
            projectLimit: 2,
            dailyTokenLimit: 100,
            advisorSeatLimit: 0,
            maxInventors: 0,
            licenseDiscount: '无折扣',
            priority: '基础推荐'
        },
        professional: {
            level: 'professional',
            name: '专业版',
            price: '¥299/年',
            projectLimit: 8,
            dailyTokenLimit: 500,
            advisorSeatLimit: 10,
            maxInventors: 10,
            licenseDiscount: '资料许可 9 折',
            priority: '深度推荐'
        },
        enterprise: {
            level: 'enterprise',
            name: '企业版',
            price: '¥799/年',
            projectLimit: 30,
            dailyTokenLimit: 2000,
            advisorSeatLimit: Infinity,
            maxInventors: Infinity,
            licenseDiscount: '资料许可 8 折',
            priority: '交易意向优先跟进'
        }
    };

    const LEVEL_ALIASES = {
        basic: 'free',
        advanced: 'professional',
        premium: 'enterprise'
    };

    const LICENSE_TIERS = {
        basic: 1999,
        standard: 2999,
        premium: 3999
    };

    function normalizeMembershipLevel(level) {
        return LEVEL_ALIASES[level] || level || 'free';
    }

    function readPlanLimit(value, fallback) {
        if (value === Infinity || value === 'unlimited') return Infinity;
        if (Number.isFinite(value)) return value;
        if (value !== null && value !== undefined && value !== '') {
            const parsed = Number(value);
            if (Number.isFinite(parsed)) return parsed;
        }
        return fallback;
    }

    function getMembershipPlan(planOrLevel) {
        const raw = planOrLevel && typeof planOrLevel === 'object' ? planOrLevel : {};
        const level = normalizeMembershipLevel(typeof planOrLevel === 'string' ? planOrLevel : raw.level);
        const base = MEMBERSHIP_PLANS[level] || MEMBERSHIP_PLANS.free;
        const projectLimit = readPlanLimit(raw.projectLimit, base.projectLimit);
        const dailyTokenLimit = readPlanLimit(raw.dailyTokenLimit, base.dailyTokenLimit);
        const hasAdvisorSeatLimit = raw.advisorSeatLimit !== undefined && raw.advisorSeatLimit !== null && raw.advisorSeatLimit !== '';
        const hasLegacySeatLimit = raw.maxInventors !== undefined && raw.maxInventors !== null && raw.maxInventors !== '';
        const advisorSeatSource = hasAdvisorSeatLimit
            ? raw.advisorSeatLimit
            : (base.level === 'free' ? base.advisorSeatLimit : (hasLegacySeatLimit ? raw.maxInventors : base.advisorSeatLimit));
        const advisorSeatLimit = readPlanLimit(advisorSeatSource, base.advisorSeatLimit);

        return Object.assign({}, base, raw, {
            level: base.level,
            name: raw.name || base.name,
            price: raw.price || base.price,
            projectLimit,
            dailyTokenLimit,
            advisorSeatLimit,
            maxInventors: advisorSeatLimit,
            licenseDiscount: raw.licenseDiscount || base.licenseDiscount,
            priority: raw.priority || base.priority
        });
    }

    function getAdvisorSeatLimit(planOrLevel) {
        return getMembershipPlan(planOrLevel).advisorSeatLimit;
    }

    function createId(prefix) {
        return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
    }

    function cloneUser(user) {
        return Object.assign({}, user || {});
    }

    function ensureEnterpriseUser(user) {
        const next = cloneUser(user);
        next.id = next.id || 'user_001';
        next.name = next.name || '张明';
        next.companyName = next.companyName || '华创科技有限公司';
        next.isLoggedIn = true;
        next.role = 'buyer_enterprise';
        next.verification = next.verification || { status: 'unverified' };
        next.purchasedLicenses = next.purchasedLicenses || [];
        next.favorites = next.favorites || [];
        next.tokenUsedToday = next.tokenUsedToday || 0;
        next.tokenUsageDate = next.tokenUsageDate || new Date().toISOString().slice(0, 10);
        return next;
    }

    function isEnterpriseVerified(user) {
        return !!(user && user.verification && user.verification.status === 'verified');
    }

    function canPerformCommercialAction(user) {
        if (!user || !user.isLoggedIn) {
            return { allowed: false, reason: '请先注册或登录企业账号' };
        }
        if (!isEnterpriseVerified(user)) {
            return { allowed: false, reason: '请先完成企业小额打款认证' };
        }
        return { allowed: true, reason: '' };
    }

    function startMicroDepositVerification(user, form, forcedAmount) {
        const next = ensureEnterpriseUser(user);
        const amount = typeof forcedAmount === 'number'
            ? forcedAmount
            : Number((0.11 + Math.random() * 0.78).toFixed(2));

        next.companyName = form.companyName || next.companyName;
        next.verification = {
            status: 'pending_deposit',
            companyName: form.companyName,
            bankAccount: form.bankAccount,
            bankName: form.bankName,
            legalContact: form.legalContact || '',
            depositAmount: amount,
            startedAt: new Date().toISOString()
        };
        return next;
    }

    function confirmMicroDeposit(user, amount) {
        const next = ensureEnterpriseUser(user);
        const expected = Number(next.verification && next.verification.depositAmount);
        const actual = Number(amount);

        if (Number.isFinite(expected) && Math.abs(expected - actual) < 0.001) {
            next.verification = Object.assign({}, next.verification, {
                status: 'verified',
                verifiedAt: new Date().toISOString()
            });
            return next;
        }

        next.verification = Object.assign({}, next.verification, {
            status: 'failed',
            failedAt: new Date().toISOString()
        });
        return next;
    }

    function activateMembership(user, level) {
        const canonicalLevel = normalizeMembershipLevel(level);
        const plan = getMembershipPlan(canonicalLevel);
        const next = ensureEnterpriseUser(user);
        next.membership = {
            level: plan.level,
            name: plan.name,
            projectLimit: plan.projectLimit,
            dailyTokenLimit: plan.dailyTokenLimit,
            advisorSeatLimit: plan.advisorSeatLimit,
            maxInventors: plan.advisorSeatLimit,
            licenseDiscount: plan.licenseDiscount,
            priority: plan.priority,
            expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
        };
        next.tokenUsedToday = 0;
        next.tokenUsageDate = new Date().toISOString().slice(0, 10);
        if (plan.advisorSeatLimit === 0) {
            next.digitalHumanSeats = [];
        }
        return next;
    }

    function canCreateDemandProject(user, existingProjects) {
        if (!user || !user.isLoggedIn) {
            return { allowed: false, reason: '请先注册企业账号' };
        }
        const plan = getMembershipPlan(user.membership || 'free');
        const projectLimit = Number.isFinite(plan.projectLimit) ? plan.projectLimit : MEMBERSHIP_PLANS.free.projectLimit;
        const count = (existingProjects || []).length;
        if (count >= projectLimit) {
            return {
                allowed: false,
                reason: `当前方案最多支持 ${projectLimit} 个技术需求项目，请升级会员后继续创建`
            };
        }
        return { allowed: true, reason: '' };
    }

    function canChatAboutPatent(user, patent, purchasedLicenses) {
        if (!user || !user.isLoggedIn) {
            return { allowed: false, reason: '请先注册企业账号' };
        }
        if (patent && !isFreeSharedPatent(patent) && !(purchasedLicenses || []).includes(patent.id)) {
            return {
                allowed: false,
                reason: '该专利需要先购买资料/对话许可'
            };
        }
        return { allowed: true, reason: '' };
    }

    function isFreeSharedPatent(patent) {
        if (!patent) return true;
        return !Number(patent.price) && !Number(patent.licensePrice);
    }

    function getPatentLicensePrice(patent) {
        if (isFreeSharedPatent(patent)) return 0;
        if (Number(patent && patent.licensePrice)) return Number(patent.licensePrice);
        const tier = patent && patent.licenseTier ? patent.licenseTier : 'standard';
        return LICENSE_TIERS[tier] || LICENSE_TIERS.standard;
    }

    function getPatentLicenseLabel(patent) {
        const price = getPatentLicensePrice(patent);
        if (!price) return '免费共享 / 可先沟通';
        return `¥${price.toLocaleString('zh-CN')}/年 资料/对话许可`;
    }

    function hasPaidMembership(user) {
        const level = user && user.membership && normalizeMembershipLevel(user.membership.level);
        return level === 'professional' || level === 'enterprise';
    }

    function canBookAppointment(user, patent) {
        const gate = canPerformCommercialAction(user);
        if (!gate.allowed) return gate;

        if (hasPaidMembership(user)) {
            return { allowed: true, reason: '' };
        }

        if (!isFreeSharedPatent(patent) && user.purchasedLicenses && user.purchasedLicenses.includes(patent.id)) {
            return { allowed: true, reason: '' };
        }

        return {
            allowed: false,
            reason: '预约真人需要开通专业版/企业版，或先购买当前付费专利的资料/对话许可'
        };
    }

    function patentSearchText(patent) {
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

    const DOMAIN_TERMS = [
        '人工智能', 'AI', '医学影像', '影像诊断', '医疗诊断', '基层医院', '医院', '影像', '诊断', '医生', '病灶', '临床', '医疗',
        '电池热管理', '热失控', '高温安全', '电池', '热管理', '高温', '寿命', '新能源', '电芯',
        '医疗数据', '隐私保护', '数据上链', '区块链', '隐私', '上链', '加密', '合规', '可信', '联邦建模', '联邦学习',
        '物联网', '智能家居', '语音控制', '设备互联',
        '机器人', '制造', '调度', '柔性产线', '自动化', '质检', '缺陷检测', '车间',
        'RAG', '知识库', '推荐系统', '冷启动', '冷链', '温控', '能耗',
        '智慧农业', '病虫害', '农作物', '灌溉', '土壤', '碳排放', '碳核算', '节能', '环保', '水处理', '工业安全', '药物研发', '蛋白设计', '康复训练', '养老照护', '教育评测'
    ];

    const SEARCH_STOP_WORDS = new Set([
        '一种', '基于', '系统', '方法', '装置', '技术', '应用', '方案', '能力', '效率', '提升', '解决',
        '智能', '安全', '管理', '控制', '用于', '以及', '进行', '实现', '支持', '企业', '需求'
    ]);

    const INTENT_GROUPS = {
        ai: {
            label: 'AI能力',
            pattern: /人工智能|ai|机器学习|深度学习|大模型|算法模型|智能诊断|辅助诊断|少样本/i
        },
        medical: {
            label: '医疗场景',
            pattern: /医疗|医学|医院|影像|诊断|医生|病灶|临床|基层医院|患者/i
        },
        battery: {
            label: '电池热安全',
            pattern: /电池|热失控|新能源|电芯|高温|热管理|热安全|寿命/i
        },
        privacy: {
            label: '隐私合规',
            pattern: /隐私|上链|区块链|加密|合规|可信|联邦|数据不出域|多机构/i
        },
        manufacturing: {
            label: '制造产线',
            pattern: /制造|质检|机器人|车间|产线|能耗|调度|缺陷|工业视觉|自动化/i
        },
        enterprise: {
            label: '企业知识服务',
            pattern: /rag|知识库|推荐|问答|冷启动|可追溯|知识图谱/i
        },
        iot: {
            label: '物联感知',
            pattern: /物联网|智能家居|传感器|设备互联|冷链|温控|预警/i
        },
        agriculture: {
            label: '农业场景',
            pattern: /农业|农作物|病虫害|灌溉|土壤|温室|农田|作物/i
        },
        carbon: {
            label: '碳排节能',
            pattern: /碳排放|碳核算|节能|环保|水处理|排放|能耗|双碳/i
        },
        bio: {
            label: '生物医药',
            pattern: /药物|蛋白|分子|筛选|生物医药|临床前|研发/i
        },
        safety: {
            label: '安全监测',
            pattern: /工地|矿山|施工|作业安全|安全监测|风险预警|危险区域|高空作业/i
        }
    };

    function extractSearchTerms(text) {
        const normalized = String(text || '').toLowerCase();
        const terms = new Map();
        const addTerm = (term, weight) => {
            const value = String(term || '').trim().toLowerCase();
            if (value.length < 2) return;
            terms.set(value, Math.max(terms.get(value) || 0, weight));
        };

        normalized
            .split(/[，。,.、\s/|;；:：()（）与和及或用于提升解决]+/)
            .filter(token => token.length >= 2)
            .forEach(token => addTerm(token, Math.min(3, token.length / 2)));

        DOMAIN_TERMS.forEach(term => {
            if (normalized.includes(term.toLowerCase())) {
                addTerm(term, term.length >= 4 ? 3 : 2);
            }
        });

        const chineseRuns = normalized.match(/[\u4e00-\u9fa5]{2,}/g) || [];
        chineseRuns.forEach(run => {
            for (let size = 2; size <= 4; size += 1) {
                for (let index = 0; index <= run.length - size; index += 1) {
                    const gram = run.slice(index, index + size);
                    if (!SEARCH_STOP_WORDS.has(gram)) {
                        addTerm(gram, size === 2 ? 0.15 : 0.35);
                    }
                }
            }
        });

        return Array.from(terms.entries())
            .filter(([term]) => !SEARCH_STOP_WORDS.has(term))
            .map(([term, weight]) => ({ term, weight }));
    }

    function lexicalScore(query, patent) {
        const text = patentSearchText(patent).toLowerCase();
        const terms = extractSearchTerms(query);
        if (!terms.length) return 0;

        let matchedWeight = 0;
        let totalWeight = 0;
        terms.forEach(({ term, weight }) => {
            totalWeight += weight;
            if (text.includes(term)) {
                matchedWeight += weight;
            }
        });

        return totalWeight ? Math.min(matchedWeight / totalWeight, 1) : 0;
    }

    function analyzeDemandIntent(query, project) {
        const text = [
            query,
            project && project.title,
            project && project.industry,
            project && project.stage,
            project && project.description,
            project && project.companyContext
        ].filter(Boolean).join(' ');

        const groups = Object.entries(INTENT_GROUPS)
            .filter(([, group]) => group.pattern.test(text))
            .map(([id, group]) => ({ id, label: group.label, pattern: group.pattern }));

        return { text, groups };
    }

    function patentIntentCoverage(intent, patent) {
        if (!intent || !intent.groups.length) {
            return { score: 0, matched: [], missing: [] };
        }

        const text = patentSearchText(patent);
        const matched = intent.groups.filter(group => group.pattern.test(text));
        const missing = intent.groups.filter(group => !group.pattern.test(text));

        return {
            score: matched.length / intent.groups.length,
            matched: matched.map(group => group.label),
            missing: missing.map(group => group.label)
        };
    }

    function fieldScore(project, query, patent) {
        const reasons = [];
        let score = 0;
        const text = `${query || ''} ${project && project.title || ''} ${project && project.description || ''}`.toLowerCase();

        if (project && project.industry && patent.industry && project.industry === patent.industry) {
            score += 0.45;
            reasons.push(`行业匹配：${project.industry}`);
        }
        if (patent.field && text.includes(String(patent.field).toLowerCase())) {
            score += 0.3;
            reasons.push(`领域命中：${patent.field}`);
        }
        if (project && project.stage) {
            score += 0.1;
            reasons.push(`适合${project.stage}阶段评估`);
        }
        const lexical = lexicalScore(query, patent);
        if (lexical > 0) {
            score += Math.min(lexical * 0.25, 0.25);
            reasons.push('关键词与专利文本有重合');
        }
        return { score: Math.min(score, 1), reasons };
    }

    function businessBoost(user, patent, hasRelevance) {
        const reasons = [];
        let score = 0;
        if (!hasRelevance) return { score, reasons };
        if (isFreeSharedPatent(patent)) {
            score += 0.35;
            reasons.push('免费共享专利，可先低门槛沟通');
        }
        if (user && user.purchasedLicenses && user.purchasedLicenses.includes(patent.id)) {
            score += 0.35;
            reasons.push('已购买资料/对话许可，可直接深聊');
        }
        if (user && hasPaidMembership(user)) {
            score += 0.2;
            reasons.push('当前会员权益支持更深度跟进');
        }
        return { score: Math.min(score, 1), reasons };
    }

    function rankPatentsHybrid(options) {
        const query = options.query || '';
        const project = options.project || null;
        const semanticScores = options.semanticScores || {};
        const user = options.user || null;
        const demandIndustry = project && project.industry ? project.industry : detectDemandIndustry(query);
        const intent = analyzeDemandIntent(query, project);
        const requiredCoverage = intent.groups.length > 1 ? 1 : 0.65;

        return (options.patents || []).map(patent => {
            const semantic = Math.max(0, Math.min(1, Number(semanticScores[patent.id] || 0)));
            const lexicalFallback = lexicalScore(query, patent);
            const fields = fieldScore(project, query, patent);
            const coverage = patentIntentCoverage(intent, patent);
            const hasQuery = !!String(query || '').trim() || !!project;
            const industryAligned = !demandIndustry || patentMatchesDemandIndustry(demandIndustry, patent);
            const intentAligned = !intent.groups.length || coverage.score >= requiredCoverage;
            const anchoredRelevance = lexicalFallback >= (intent.groups.length > 1 ? 0.14 : 0.08)
                || fields.score >= 0.22
                || coverage.score >= requiredCoverage;
            const semanticAdjusted = semantic ? Math.max(0, Math.min(1, (semantic - 0.78) / 0.22)) : 0;
            const semanticRelevance = semantic >= 0.9 && intentAligned && (lexicalFallback >= 0.04 || fields.score >= 0.15 || coverage.score >= requiredCoverage);
            const hasRelevance = !hasQuery || (industryAligned && intentAligned && (anchoredRelevance || semanticRelevance));
            const commercial = businessBoost(user, patent, hasRelevance);
            const textSignal = Math.max(semanticAdjusted, lexicalFallback);
            const finalScore = hasRelevance
                ? Math.round((coverage.score * 0.42 + fields.score * 0.23 + textSignal * 0.25 + commercial.score * 0.1) * 100)
                : 0;
            const explanations = [];

            if (semantic) explanations.push(`语义相似度 ${Math.round(semantic * 100)}%`);
            else if (lexicalFallback) explanations.push('语义模型不可用，使用关键词语义回退');
            if (coverage.matched.length) explanations.push(`需求锚点命中：${coverage.matched.join('、')}`);
            fields.reasons.forEach(reason => explanations.push(reason));
            commercial.reasons.forEach(reason => explanations.push(reason));
            if (!hasRelevance && coverage.missing.length) explanations.push(`缺少关键锚点：${coverage.missing.join('、')}`);
            if (!explanations.length) explanations.push(hasRelevance ? '作为备选技术方向参与比较' : '相关性不足，建议上传完整需求文本获得更准确推荐');

            return {
                patentId: patent.id,
                inventorId: patent.inventorId,
                score: Math.max(finalScore, 0),
                relevant: hasRelevance,
                matchReasons: explanations,
                explanations,
                scenario: project
                    ? `${project.stage || '当前阶段'}可围绕“${project.title}”验证适配度。`
                    : '可先通过数字发明人了解技术边界和落地条件。',
                risks: patent.risks && patent.risks.length ? patent.risks : ['需要结合企业现有数据、预算和落地周期进一步评估'],
                nextAction: !isFreeSharedPatent(patent)
                    ? '购买资料/对话许可后，与数字发明人做深度匹配分析'
                    : '与数字发明人沟通技术边界，再提交交易意向'
            };
        }).sort((a, b) => b.score - a.score);
    }

    function scorePatent(project, patent) {
        const text = `${project.title || ''} ${project.industry || ''} ${project.description || ''} ${project.companyContext || ''}`.toLowerCase();
        const patentText = `${patent.title || ''} ${patent.field || ''} ${patent.industry || ''} ${patent.summary || ''}`.toLowerCase();
        let score = 40;
        const reasons = [];

        if (project.industry && patent.industry && project.industry === patent.industry) {
            score += 25;
            reasons.push(`行业同属${project.industry}`);
        }
        if (patent.field && text.includes(String(patent.field).toLowerCase())) {
            score += 20;
            reasons.push(`需求文本直接命中${patent.field}`);
        }
        String(project.description || '').split(/[，。,.、\s]+/).filter(Boolean).forEach(word => {
            if (word.length >= 2 && patentText.includes(word.toLowerCase())) {
                score += 3;
            }
        });
        if (reasons.length === 0) {
            reasons.push('技术方向可作为备选方案比较');
        }
        return { score: Math.min(score, 98), reasons };
    }

    function detectDemandIndustry(text) {
        const value = String(text || '').toLowerCase();
        if (/电池|热失控|新能源|电芯|高温|热管理/.test(value)) return '新能源汽车';
        if (/医疗|医学|医院|影像|医生|病灶|临床|电子病历|康复|脑卒中|医疗数据|患者/.test(value)) return '医疗健康';
        if (/隐私|上链|合规|区块链|加密|可信/.test(value)) return '金融科技';
        if (/制造|质检|机器人|车间|产线|能耗|调度|缺陷/.test(value)) return '先进制造';
        if (/rag|知识库|推荐|问答|冷启动/.test(value)) return '企业服务';
        if (/农业|农作物|病虫害|灌溉|土壤|温室|农田|作物/.test(value)) return '智慧农业';
        if (/碳排放|碳核算|节能|环保|水处理|排放|双碳/.test(value)) return '节能环保';
        if (/药物|蛋白|分子|筛选|生物医药|临床前/.test(value)) return '生物医药';
        if (/工地|矿山|施工|作业安全|安全监测|风险预警/.test(value)) return '工业安全';
        if (/诊断/.test(value)) return '医疗健康';
        return '';
    }

    function patentMatchesDemandIndustry(industry, patent) {
        if (!industry) return true;
        if (patent && patent.industry === industry) return true;
        const text = patentSearchText(patent).toLowerCase();
        if (industry === '医疗健康') return /医疗|医院|影像|诊断|医生|病灶|临床/.test(text);
        if (industry === '新能源汽车') return /电池|热失控|新能源|电芯|高温|热管理/.test(text);
        if (industry === '金融科技') return /隐私|上链|合规|区块链|加密|可信/.test(text);
        if (industry === '先进制造') return /制造|质检|机器人|车间|产线|能耗|调度|缺陷/.test(text);
        if (industry === '企业服务') return /rag|知识库|推荐|问答|冷启动|企业服务/.test(text);
        if (industry === '智慧农业') return /农业|农作物|病虫害|灌溉|土壤|温室|农田|作物/.test(text);
        if (industry === '节能环保') return /碳排放|碳核算|节能|环保|水处理|排放|双碳/.test(text);
        if (industry === '生物医药') return /药物|蛋白|分子|筛选|生物医药|临床前/.test(text);
        if (industry === '工业安全') return /工地|矿山|施工|作业安全|安全监测|风险预警/.test(text);
        return true;
    }

    function inferDemandIndustry(text) {
        return detectDemandIndustry(text) || '企业服务';
    }

    function inferDemandStage(text) {
        const value = String(text || '').toLowerCase();
        if (/采购|招标|选型|评估/.test(value)) return '采购评估';
        if (/试点|验证|pilot|poc/.test(value)) return '试点验证';
        if (/规模|落地|上线|部署|推广/.test(value)) return '规模化落地';
        if (/调研|方案|了解|探索/.test(value)) return '方案调研';
        return '方案调研';
    }

    function parseDemandText(text) {
        const cleaned = String(text || '')
            .replace(/\r\n?/g, '\n')
            .replace(/\u0000/g, '')
            .replace(/[ \t]+/g, ' ')
            .replace(/\n{3,}/g, '\n\n')
            .trim()
            .slice(0, 5000);

        const lines = cleaned.split('\n').map(line => line.trim()).filter(Boolean);
        const firstLine = (lines[0] || '').replace(/^#+\s*/, '').replace(/^[-*]\s*/, '').trim();
        const fallbackTime = new Date().toLocaleString('zh-CN', {
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
        const title = firstLine
            ? firstLine.slice(0, 24)
            : `上传需求项目 ${fallbackTime}`;
        const body = lines.length > 1 ? lines.slice(1).join('\n') : cleaned;
        const description = (body || cleaned || title).slice(0, 5000);
        const summary = description.replace(/\s+/g, ' ').slice(0, 90);

        return {
            title,
            industry: inferDemandIndustry(cleaned),
            budget: '20-50万',
            stage: inferDemandStage(cleaned),
            description,
            companyContext: '',
            summary,
            source: 'uploaded_text'
        };
    }

    function createDemandProject(input, patentList) {
        const project = {
            id: createId('project'),
            title: input.title,
            industry: input.industry,
            budget: input.budget,
            stage: input.stage,
            description: input.description,
            companyContext: input.companyContext || '',
            createdAt: new Date().toISOString()
        };

        project.recommendations = (patentList || [])
            ? rankPatentsHybrid({
                query: `${project.title} ${project.description}`,
                project,
                patents: patentList
            })
            : [];

        return project;
    }

    function createTradeIntent(user, input) {
        const gate = canPerformCommercialAction(user);
        if (!gate.allowed) {
            throw new Error(gate.reason);
        }
        return {
            id: createId('intent'),
            projectId: input.projectId,
            patentId: input.patentId,
            contactName: input.contactName,
            contactPhone: input.contactPhone,
            message: input.message,
            needAdvisor: !!input.needAdvisor,
            status: '待跟进',
            createdAt: new Date().toISOString()
        };
    }

    function composeAdvisorReply(context) {
        const project = context.project || {};
        const patent = context.patent || {};
        const question = context.question || '这项专利适合我们吗？';
        const inventorName = context.inventorName || '数字发明人';
        const projectTitle = project.title || '当前技术需求';
        const industry = project.industry || patent.industry || '目标行业';
        const stage = project.stage || '评估阶段';
        const patentTitle = patent.title || '这项专利';

        return [
            `我是${inventorName}。结合“${projectTitle}”这个需求，我会用企业能理解的方式来回答：${question}`,
            `这项“${patentTitle}”更适合先放在${industry}场景里做${stage}验证。它的价值不是单纯“技术先进”，而是能否缩短你们现有方案从试点到落地的路径。`,
            `建议你们重点看三件事：第一，现有数据或设备接口能不能接入；第二，预算是否覆盖二次适配；第三，内部是否有业务部门愿意参与试点。`,
            `如果这三点基本成立，下一步不建议只继续聊天，可以提交交易意向，让平台把需求、专利和后续顾问沟通串起来。`
        ].join('\n\n');
    }

    global.ScholarMateBusinessCore = {
        MEMBERSHIP_PLANS,
        LICENSE_TIERS,
        normalizeMembershipLevel,
        getMembershipPlan,
        getAdvisorSeatLimit,
        ensureEnterpriseUser,
        isEnterpriseVerified,
        canPerformCommercialAction,
        startMicroDepositVerification,
        confirmMicroDeposit,
        activateMembership,
        canCreateDemandProject,
        canChatAboutPatent,
        isFreeSharedPatent,
        getPatentLicensePrice,
        getPatentLicenseLabel,
        hasPaidMembership,
        canBookAppointment,
        patentSearchText,
        rankPatentsHybrid,
        parseDemandText,
        createDemandProject,
        createTradeIntent,
        composeAdvisorReply
    };
})(typeof globalThis !== 'undefined' ? globalThis : window);
