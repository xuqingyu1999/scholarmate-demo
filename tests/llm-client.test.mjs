import assert from 'node:assert';
import fs from 'node:fs';
import vm from 'node:vm';

const ZH_MARKER_EXAMPLE = '\u3010\u4f9d\u636e\u3011CNxxxx, CNyyyy';

const source = fs.readFileSync(new URL('../scripts/llm-client.js', import.meta.url), 'utf8');
const sessionStore = new Map();
const requests = [];

const sandbox = {
  console,
  window: {
    SCHOLARMATE_CHAT_TOKEN: 'window-token-123'
  },
  document: {
    querySelector(selector) {
      if (selector === 'meta[name="scholarmate-chat-token"]') {
        return { getAttribute(name) { return name === 'content' ? 'meta-token-456' : ''; } };
      }
      return null;
    }
  },
  fetch: async (url, options) => {
    requests.push({ url, options });
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      async json() {
        return { reply: 'serverless reply', model: 'gpt-serverless', provider: 'serverless-openai-compatible' };
      }
    };
  },
  sessionStorage: {
    getItem(key) {
      return sessionStore.get(key) || null;
    },
    setItem(key, value) {
      sessionStore.set(key, String(value));
    },
    removeItem(key) {
      sessionStore.delete(key);
    }
  }
};

vm.createContext(sandbox);
vm.runInContext(source, sandbox);

const LlmClient = sandbox.LlmClient;

assert.strictEqual(typeof LlmClient.composePersonaPrompt, 'function');
assert.strictEqual(typeof LlmClient.composeKnowledgeBoundaryPrompt, 'function');
assert.strictEqual(typeof LlmClient.buildConversationMessages, 'function');
assert.strictEqual(typeof LlmClient.buildAdvisorMessages, 'function');
assert.strictEqual(typeof LlmClient.sendAdvisorChat, 'function');

const configBefore = LlmClient.getConfig();
assert.strictEqual(configBefore.provider, 'serverless-openai-compatible');
assert.strictEqual(configBefore.model, 'serverless');

const saved = LlmClient.saveSessionConfig({
  baseURL: 'https://example.test/v1/',
  apiKey: 'sk-demo-secret',
  model: 'demo-chat'
});
assert.strictEqual(saved.provider, 'serverless-openai-compatible');
assert.strictEqual(saved.model, 'serverless');
assert.strictEqual(sessionStore.size, 0, 'sessionStorage should not persist secret LLM config');

const inventor = { id: 'isjian', name: 'Jian MA', affiliation: 'City University of Hong Kong, Department of Information Systems' };
const knowledgePatents = [
  {
    id: '63943642',
    publicationNumber: '63943642',
    title: 'Large language model patent recommendation method',
    field: 'large language model patent recommendation',
    summary: 'Patent recommendation with quality and heterogeneous data signals',
    keywords: ['large language model', 'patent recommendation', 'patent quality'],
    inventorId: 'isjian'
  }
];

const boundaryPrompt = LlmClient.composeKnowledgeBoundaryPrompt({
  inventor,
  patents: knowledgePatents,
  fieldName: 'large language model patent recommendation'
});
assert.ok(boundaryPrompt.includes('Layer 1'));
assert.ok(boundaryPrompt.includes('Layer 2'));
assert.ok(boundaryPrompt.includes('Layer 3'));
assert.ok(boundaryPrompt.includes('63943642'));
assert.ok(boundaryPrompt.includes(ZH_MARKER_EXAMPLE));

const conversation = LlmClient.buildConversationMessages(
  [
    { role: 'user', content: 'Q1' },
    { role: 'ai', content: 'A1\n\u3010\u4f9d\u636e\u301163943642' },
    { role: 'assistant', content: 'A2\n\u3010\u4f9d\u636e\u301163943652' }
  ],
  'Q2'
);
assert.deepStrictEqual(
  JSON.parse(JSON.stringify(conversation)),
  [
    { role: 'user', content: 'Q1' },
    { role: 'assistant', content: 'A1' },
    { role: 'assistant', content: 'A2' },
    { role: 'user', content: 'Q2' }
  ]
);

const safeAdvisorMessages = LlmClient.buildAdvisorMessages({
  inventor,
  patent: knowledgePatents[0],
  history: [
    { role: 'user', content: 'history user turn' },
    { role: 'assistant', content: 'history assistant turn' }
  ],
  question: 'latest question'
});
assert.deepStrictEqual(
  JSON.parse(JSON.stringify(safeAdvisorMessages.map(item => item.role))),
  ['system', 'user'],
  'serverless-safe advisor messages should only contain system + latest user question'
);
assert.ok(
  safeAdvisorMessages[0].content.includes('history user turn') && safeAdvisorMessages[0].content.includes('history assistant turn'),
  'history should only be embedded inside untrusted system transcript'
);
assert.strictEqual(safeAdvisorMessages[1].content, 'latest question');

const reply = await LlmClient.sendAdvisorChat({
  inventor,
  patent: knowledgePatents[0],
  persona: { scholarId: 'isjian', title: 'Patent Recommendation Digital Scholar' },
  knowledgePatents,
  patents: knowledgePatents,
  project: { title: 'project x', industry: 'health' },
  user: { name: 'Alice', companyName: 'Acme', phone: '13800000000' },
  history: [{ role: 'user', content: 'history question' }],
  question: 'latest question'
});

assert.strictEqual(reply, 'serverless reply');
assert.strictEqual(requests[0].url, '/api/chat');
assert.ok(!('Authorization' in (requests[0].options.headers || {})), 'frontend request should not include API key auth headers');
assert.ok(!String(requests[0].options.body).includes('apiKey'));
assert.ok(!String(requests[0].options.body).includes('baseURL'));
assert.strictEqual(requests[0].options.headers['x-scholar-mate-chat-token'], 'window-token-123', 'client should send deployment token header when present on window');

const payload = JSON.parse(requests[0].options.body);
assert.ok(!('messages' in payload), 'frontend should not send built messages array');
assert.ok(!('model' in payload), 'frontend payload should not send model');
assert.strictEqual(payload.inventorId, 'isjian', 'frontend payload should send inventorId only');
assert.strictEqual(payload.patentId, '63943642', 'frontend payload should send patentId only');
assert.ok(!('inventor' in payload), 'frontend payload should not send full inventor object');
assert.ok(!('patent' in payload), 'frontend payload should not send full patent object');
assert.ok(!('persona' in payload), 'frontend payload should not send persona objects');
assert.ok(!('patents' in payload), 'frontend payload should not send full patent catalog');
assert.ok(!('knowledgePatents' in payload), 'frontend payload should not send evidence lists');
assert.ok(Array.isArray(payload.history), 'frontend payload may send sanitized history');
assert.ok(payload.user && payload.user.name === 'Alice' && payload.user.companyName === 'Acme', 'frontend payload should keep only sanitized user fields');
assert.ok(!('phone' in (payload.user || {})), 'frontend payload should not include extra user secrets');

LlmClient.clearConfig();
assert.strictEqual(LlmClient.getConfig().provider, 'serverless-openai-compatible');
assert.strictEqual(sessionStore.size, 0);

delete sandbox.window.SCHOLARMATE_CHAT_TOKEN;
requests.length = 0;
await LlmClient.sendAdvisorChat({
  inventorId: 'isjian',
  patentId: '63943642',
  question: 'another question'
});
assert.strictEqual(requests[0].options.headers['x-scholar-mate-chat-token'], 'meta-token-456', 'client should read token from meta tag when window token missing');

console.log('llm-client tests passed');
