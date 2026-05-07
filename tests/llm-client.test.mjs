import assert from 'node:assert';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../scripts/llm-client.js', import.meta.url), 'utf8');
const sessionStore = new Map();
const localStore = new Map();
const requests = [];

const sandbox = {
  console,
  fetch: async (url, options) => {
    requests.push({ url, options });
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      async json() {
        return { choices: [{ message: { content: '真实模型回复' } }] };
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
  },
  localStorage: {
    getItem(key) {
      return localStore.get(key) || null;
    },
    setItem(key, value) {
      localStore.set(key, String(value));
    },
    removeItem(key) {
      localStore.delete(key);
    }
  }
};

vm.createContext(sandbox);
vm.runInContext(source, sandbox);

const LlmClient = sandbox.LlmClient;

LlmClient.saveSessionConfig({
  baseURL: 'https://example.test/v1/',
  apiKey: 'sk-demo-secret',
  model: 'demo-chat'
});

assert.strictEqual(localStore.size, 0);
assert.strictEqual(LlmClient.getConfig().baseURL, 'https://example.test/v1');
assert.strictEqual(LlmClient.isConfigured(), true);

const content = await LlmClient.sendChat({
  config: LlmClient.getConfig(),
  messages: [{ role: 'user', content: '你好' }]
});

assert.strictEqual(content, '真实模型回复');
assert.strictEqual(requests[0].url, 'https://example.test/v1/chat/completions');
assert.strictEqual(requests[0].options.headers.Authorization, 'Bearer sk-demo-secret');
assert.ok(!requests[0].options.body.includes('sk-demo-secret'));

sandbox.fetch = async () => ({
  ok: false,
  status: 401,
  statusText: 'Unauthorized',
  async json() {
    return { error: { message: 'bad key' } };
  }
});

await assert.rejects(
  () => LlmClient.sendChat({ config: LlmClient.getConfig(), messages: [{ role: 'user', content: 'hi' }] }),
  /401/
);
assert.strictEqual(
  LlmClient.safeErrorMessage(new Error('LLM 请求失败 401 Unauthorized：bad key sk-demo-secret')),
  '认证失败，请检查 API key 是否有效。'
);

LlmClient.clearConfig();
assert.strictEqual(LlmClient.getConfig(), null);

console.log('llm-client tests passed');
