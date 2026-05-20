import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MAX_BODY_BYTES = 64 * 1024;
const MAX_QUESTION_CHARS = 4000;
const MAX_HISTORY_TURNS = 12;
const MAX_HISTORY_CONTENT_CHARS = 1000;
const FORBIDDEN_CLIENT_FIELDS = ['messages', 'inventor', 'patent', 'persona', 'personas', 'patents', 'knowledgePatents'];

let cachedLlmClient = null;
let cachedTrustedData = null;

function createStorageStub() {
    return {
        getItem() { return null; },
        setItem() {},
        removeItem() {},
        key() { return null; },
        get length() { return 0; }
    };
}

function loadLlmClient() {
    if (cachedLlmClient) return cachedLlmClient;
    const sourcePath = path.resolve(__dirname, '../scripts/llm-client.js');
    const source = fs.readFileSync(sourcePath, 'utf8');
    const sandbox = { console };
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(source, sandbox);
    if (!sandbox.LlmClient) throw new Error('LlmClient unavailable');
    cachedLlmClient = sandbox.LlmClient;
    return cachedLlmClient;
}

function loadTrustedData() {
    if (cachedTrustedData) return cachedTrustedData;

    const mainSourcePath = path.resolve(__dirname, '../scripts/main.js');
    const mainSource = fs.readFileSync(mainSourcePath, 'utf8');
    const personasPath = path.resolve(__dirname, '../assets/scholars/personas.json');
    const personas = JSON.parse(fs.readFileSync(personasPath, 'utf8'));

    const sandbox = {
        console,
        document: {
            addEventListener() {},
            querySelector() { return null; },
            querySelectorAll() { return []; },
            getElementById() { return null; },
            createElement() { return { appendChild() {}, remove() {}, classList: { add() {}, remove() {} } }; },
            body: { appendChild() {}, insertBefore() {}, firstChild: null, classList: { add() {}, remove() {} } }
        },
        window: {
            location: { pathname: '/index.html', hash: '', search: '' },
            addEventListener() {}
        },
        localStorage: createStorageStub(),
        sessionStorage: createStorageStub(),
        URLSearchParams
    };
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(`${mainSource}\nthis.__inventors = inventors; this.__patents = patents;`, sandbox);

    const inventors = Array.isArray(sandbox.__inventors) ? sandbox.__inventors : [];
    const patents = Array.isArray(sandbox.__patents) ? sandbox.__patents : [];

    cachedTrustedData = {
        personas: personas && typeof personas === 'object' ? personas : {},
        inventorsById: new Map(inventors.map(item => [item.id, item])),
        patentsById: new Map(patents.map(item => [item.id, item])),
        patents
    };
    return cachedTrustedData;
}

function normalizeBaseURL(baseURL) {
    return String(baseURL || 'https://api.openai.com/v1').trim().replace(/\/+$/, '');
}

function escapeRegExp(value) {
    return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function sanitizeErrorMessage(error, apiKey = '') {
    const message = String(error && error.message || error || '');
    if (!message) return 'upstream request failed';
    let sanitized = message;
    if (apiKey) {
        const keyPattern = new RegExp(escapeRegExp(apiKey), 'g');
        sanitized = sanitized.replace(keyPattern, '***');
    }
    sanitized = sanitized.replace(/sk-[A-Za-z0-9_.-]+/g, '***');
    return sanitized;
}

function parseRequestBody(req) {
    if (!req) return { value: {} };
    if (req.body && typeof req.body === 'object') {
        let bytes = 0;
        try {
            bytes = Buffer.byteLength(JSON.stringify(req.body || {}), 'utf8');
        } catch (error) {
            return { error: 'invalid json body', status: 400 };
        }
        if (bytes > MAX_BODY_BYTES) return { error: 'request body too large', status: 413 };
        return { value: req.body };
    }
    if (typeof req.body === 'string') {
        const bytes = Buffer.byteLength(req.body, 'utf8');
        if (bytes > MAX_BODY_BYTES) return { error: 'request body too large', status: 413 };
        try {
            const parsed = JSON.parse(req.body);
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
                return { error: 'json object body required', status: 400 };
            }
            return { value: parsed };
        } catch (error) {
            return { error: 'invalid json body', status: 400 };
        }
    }
    return { value: {} };
}

function normalizeHistoryRole(role) {
    if (role === 'assistant' || role === 'ai') return 'assistant';
    if (role === 'user' || role === 'human') return 'user';
    return '';
}

function sanitizeHistory(history) {
    const rows = Array.isArray(history) ? history.slice(-MAX_HISTORY_TURNS) : [];
    const sanitized = [];
    for (const row of rows) {
        const role = normalizeHistoryRole(row && row.role);
        const content = String(row && row.content || '').trim();
        if (!role || !content) continue;
        if (content.length > MAX_HISTORY_CONTENT_CHARS) {
            return { error: `history content too long (max ${MAX_HISTORY_CONTENT_CHARS})` };
        }
        sanitized.push({ role, content });
    }
    return { value: sanitized };
}

function sanitizeProject(project) {
    if (!project || typeof project !== 'object') return null;
    return {
        title: String(project.title || ''),
        industry: String(project.industry || ''),
        stage: String(project.stage || ''),
        budget: String(project.budget || ''),
        description: String(project.description || '')
    };
}

function sanitizeUser(user) {
    return {
        name: user && user.name ? String(user.name) : '',
        companyName: user && user.companyName ? String(user.companyName) : ''
    };
}

function isCrossOriginRequest(req) {
    const headers = req && req.headers ? req.headers : {};
    const origin = String(headers.origin || '').trim();
    const host = String(headers.host || '').trim();
    if (!origin || !host) return false;
    try {
        const parsed = new URL(origin);
        return parsed.host !== host;
    } catch (error) {
        return false;
    }
}

function getHeaderValue(req, headerName) {
    const headers = req && req.headers ? req.headers : {};
    if (!headers || typeof headers !== 'object') return '';
    const direct = headers[headerName];
    if (typeof direct === 'string') return direct;
    const lower = headerName.toLowerCase();
    for (const [key, value] of Object.entries(headers)) {
        if (String(key || '').toLowerCase() === lower && typeof value === 'string') return value;
    }
    return '';
}

function isValidChatToken(req, env) {
    const expectedToken = String(env.CHAT_API_TOKEN || '').trim();
    if (!expectedToken) return true;
    const providedToken = String(getHeaderValue(req, 'x-scholar-mate-chat-token') || '').trim();
    return providedToken && providedToken === expectedToken;
}

function validateBaseRequest(body) {
    for (const field of FORBIDDEN_CLIENT_FIELDS) {
        if (field in body) return `${field} field is not allowed`;
    }
    if (!String(body.inventorId || '').trim()) return 'inventorId is required';
    if (!String(body.patentId || '').trim()) return 'patentId is required';
    if (!String(body.question || '').trim()) return 'question is required';
    if (String(body.question || '').length > MAX_QUESTION_CHARS) {
        return `question too long (max ${MAX_QUESTION_CHARS})`;
    }
    return null;
}

function buildTrustedAdvisorContext(body) {
    const data = loadTrustedData();
    const inventorId = String(body.inventorId || '').trim();
    const patentId = String(body.patentId || '').trim();
    const inventor = data.inventorsById.get(inventorId);
    const patent = data.patentsById.get(patentId);
    if (!inventor) return { error: 'unknown inventorId' };
    if (!patent) return { error: 'unknown patentId' };
    if (String(patent.inventorId || '') !== inventorId) return { error: 'inventorId and patentId mismatch' };

    const historyResult = sanitizeHistory(body.history);
    if (historyResult.error) return { error: historyResult.error };

    const knowledgePatents = data.patents.filter(item => item && item.inventorId === inventorId);
    return {
        value: {
            inventor,
            patent,
            persona: data.personas[inventorId] || null,
            knowledgePatents,
            project: sanitizeProject(body.project),
            user: sanitizeUser(body.user || {}),
            history: historyResult.value,
            question: String(body.question || '').trim()
        }
    };
}

function parseReply(payload) {
    if (payload && typeof payload.reply === 'string') return payload.reply;
    const content = payload && payload.choices && payload.choices[0] && payload.choices[0].message && payload.choices[0].message.content;
    if (typeof content === 'string') return content;
    throw new Error('upstream response format invalid');
}

export function createHandler({ env = process.env, fetchImpl = fetch } = {}) {
    return async function handler(req, res) {
        if (req && req.method && req.method !== 'POST') {
            return res.status(405).json({ error: 'method_not_allowed' });
        }
        if (isCrossOriginRequest(req)) {
            return res.status(403).json({ error: 'forbidden_origin' });
        }
        if (!isValidChatToken(req, env)) {
            return res.status(401).json({ error: 'unauthorized' });
        }

        const apiKey = String(env.OPENAI_API_KEY || '').trim();
        const model = String(env.OPENAI_MODEL || '').trim();
        if (!apiKey || !model) {
            return res.status(503).json({ error: 'chat service temporarily unavailable' });
        }

        const parsedBody = parseRequestBody(req);
        if (parsedBody.error) {
            return res.status(parsedBody.status || 400).json({ error: parsedBody.error });
        }
        const body = parsedBody.value;

        const validationError = validateBaseRequest(body);
        if (validationError) {
            return res.status(400).json({ error: validationError });
        }

        const trustedContextResult = buildTrustedAdvisorContext(body);
        if (trustedContextResult.error) {
            return res.status(400).json({ error: trustedContextResult.error });
        }

        const llmClient = loadLlmClient();
        const messages = llmClient.buildAdvisorMessages(trustedContextResult.value);
        if (!Array.isArray(messages) || messages.length !== 2) {
            return res.status(500).json({ error: 'chat prompt build failed' });
        }

        const baseURL = normalizeBaseURL(env.OPENAI_BASE_URL);
        let upstreamResponse;
        let upstreamPayload = null;
        try {
            upstreamResponse = await fetchImpl(`${baseURL}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model,
                    messages,
                    temperature: 0.4,
                    stream: false
                })
            });
            try {
                upstreamPayload = await upstreamResponse.json();
            } catch (error) {
                upstreamPayload = null;
            }
        } catch (error) {
            return res.status(502).json({
                error: 'upstream request failed',
                detail: sanitizeErrorMessage(error, apiKey)
            });
        }

        if (!upstreamResponse.ok) {
            const detail = upstreamPayload && upstreamPayload.error && upstreamPayload.error.message
                ? sanitizeErrorMessage(upstreamPayload.error.message, apiKey)
                : `upstream status ${upstreamResponse.status}`;
            return res.status(502).json({
                error: 'upstream request failed',
                detail
            });
        }

        try {
            const reply = parseReply(upstreamPayload);
            return res.status(200).json({
                reply,
                model,
                provider: 'serverless-openai-compatible'
            });
        } catch (error) {
            return res.status(500).json({ error: 'chat response parsing failed' });
        }
    };
}

const defaultHandler = createHandler();
export default defaultHandler;
