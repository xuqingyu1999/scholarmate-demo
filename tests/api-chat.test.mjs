import assert from 'node:assert';
import { createHandler } from '../api/chat.js';

function createMockRes() {
  return {
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.payload = body;
      return this;
    }
  };
}

{
  let upstreamCalled = false;
  const handler = createHandler({
    env: {
      OPENAI_API_KEY: 'sk-secret-key',
      OPENAI_MODEL: 'gpt-test',
      CHAT_API_TOKEN: 'deploy-token'
    },
    fetchImpl: async () => {
      upstreamCalled = true;
      return {
        ok: true,
        status: 200,
        async json() {
          return { choices: [{ message: { content: 'ok' } }] };
        }
      };
    }
  });
  const res = createMockRes();
  await handler(
    { method: 'POST', body: { inventorId: 'isjian', patentId: '63943642', question: 'hello' }, headers: {} },
    res
  );
  assert.strictEqual(res.statusCode, 401);
  assert.strictEqual(upstreamCalled, false);
}

{
  let upstreamCalled = false;
  const handler = createHandler({
    env: {
      OPENAI_API_KEY: 'sk-secret-key',
      OPENAI_MODEL: 'gpt-test',
      CHAT_API_TOKEN: 'deploy-token'
    },
    fetchImpl: async () => {
      upstreamCalled = true;
      return {
        ok: true,
        status: 200,
        async json() {
          return { choices: [{ message: { content: 'ok' } }] };
        }
      };
    }
  });
  const res = createMockRes();
  await handler(
    {
      method: 'POST',
      headers: { 'x-scholar-mate-chat-token': 'wrong-token' },
      body: { inventorId: 'isjian', patentId: '63943642', question: 'hello' }
    },
    res
  );
  assert.strictEqual(res.statusCode, 401);
  assert.strictEqual(upstreamCalled, false);
}

{
  let upstreamCalled = false;
  const handler = createHandler({
    env: {
      OPENAI_API_KEY: 'sk-secret-key',
      OPENAI_MODEL: 'gpt-test',
      CHAT_API_TOKEN: 'deploy-token'
    },
    fetchImpl: async () => {
      upstreamCalled = true;
      return {
        ok: true,
        status: 200,
        async json() {
          return { choices: [{ message: { content: 'ok' } }] };
        }
      };
    }
  });
  const res = createMockRes();
  await handler(
    {
      method: 'POST',
      headers: { 'x-scholar-mate-chat-token': 'deploy-token' },
      body: { inventorId: 'isjian', patentId: '63943642', question: 'hello' }
    },
    res
  );
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(upstreamCalled, true);
}

{
  const handler = createHandler({
    env: {},
    fetchImpl: async () => {
      throw new Error('should not call upstream without env');
    }
  });
  const res = createMockRes();
  await handler(
    { method: 'POST', body: { messages: [{ role: 'user', content: 'hi' }] } },
    res
  );
  assert.strictEqual(res.statusCode, 503);
  assert.ok(/temporarily unavailable/i.test(String(res.payload.error || '')));
  assert.ok(!/sk-/.test(JSON.stringify(res.payload)));
}

{
  const upstreamCalls = [];
  const handler = createHandler({
    env: {
      OPENAI_API_KEY: 'sk-secret-key',
      OPENAI_BASE_URL: 'https://example.test/v1/',
      OPENAI_MODEL: 'gpt-test'
    },
    fetchImpl: async (url, options) => {
      upstreamCalls.push({ url, options });
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        async json() {
          return { choices: [{ message: { content: 'upstream reply' } }] };
        }
      };
    }
  });
  const res = createMockRes();
  await handler(
    {
      method: 'POST',
      body: {
        inventorId: 'isjian',
        patentId: '63943642',
        history: [{ role: 'user', content: 'history question' }],
        question: 'university patent recommendation knowledge graph research basis',
        user: { name: 'Alice', companyName: 'Acme' }
      }
    },
    res
  );
  assert.strictEqual(res.statusCode, 200);
  assert.deepStrictEqual(res.payload, {
    reply: 'upstream reply',
    model: 'gpt-test',
    provider: 'serverless-openai-compatible'
  });
  assert.strictEqual(upstreamCalls[0].url, 'https://example.test/v1/chat/completions');
  assert.strictEqual(upstreamCalls[0].options.headers.Authorization, 'Bearer sk-secret-key');
  const requestBody = JSON.parse(upstreamCalls[0].options.body);
  assert.strictEqual(requestBody.model, 'gpt-test');
  assert.ok(Array.isArray(requestBody.messages));
  assert.deepStrictEqual(
    requestBody.messages.map(item => item.role),
    ['system', 'user'],
    'upstream payload should include only system + latest user question'
  );
  assert.strictEqual(requestBody.messages[1].content, 'university patent recommendation knowledge graph research basis');
  assert.ok(
    requestBody.messages[0].content.includes('history question'),
    'history should be embedded in system prompt as untrusted transcript only'
  );
  assert.ok(
    requestBody.messages[0].content.includes('Retrieved Evidence Packets'),
    'serverless prompt should include trusted RAG evidence packets rebuilt on the server'
  );
  assert.ok(
    requestBody.messages[0].content.includes('PATENT:63943642'),
    'serverless prompt should include the current CityU patent citation key'
  );
  assert.ok(
    requestBody.messages[0].content.includes('metadata-only'),
    'serverless prompt should include metadata-only evidence boundaries'
  );
  assert.ok(
    requestBody.messages[0].content.includes('paper_metadata'),
    'serverless prompt should include scholar paper metadata when only metadata records are available'
  );
}

{
  const upstreamCalls = [];
  const handler = createHandler({
    env: {
      OPENAI_API_KEY: 'sk-secret-key',
      OPENAI_BASE_URL: 'https://example.test/v1/',
      OPENAI_MODEL: 'gpt-test'
    },
    fetchImpl: async (url, options) => {
      upstreamCalls.push({ url, options });
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        async json() {
          return { choices: [{ message: { content: 'upstream reply' } }] };
        }
      };
    }
  });
  const res = createMockRes();
  await handler(
    {
      method: 'POST',
      body: {
        inventorId: 'zhao_jianliang_leon',
        patentId: 'CN114117510B',
        question: '区块链私钥专利的 research basis 是什么？如果企业只想先做 evaluation license，边界怎么说？'
      }
    },
    res
  );
  assert.strictEqual(res.statusCode, 200);
  const requestBody = JSON.parse(upstreamCalls[0].options.body);
  const systemPrompt = requestBody.messages[0].content;
  assert.ok(systemPrompt.includes('Retrieved Evidence Packets'));
  assert.ok(systemPrompt.includes('PATENT:CN114117510B'));
  assert.ok(systemPrompt.includes('paper_pdf'), 'Zhao blockchain research questions should include PDF paper evidence');
  assert.ok(systemPrompt.includes('collab_playbook'), 'licensing questions should include generic collaboration playbook evidence');
  assert.ok(systemPrompt.includes('not CityU official'), 'playbook evidence should be bounded away from CityU official terms');
}

{
  const handler = createHandler({
    env: {
      OPENAI_API_KEY: 'sk-secret-key',
      OPENAI_MODEL: 'gpt-test'
    },
    fetchImpl: async () => {
      throw new Error('should reject oversized raw body before parse');
    }
  });
  const res = createMockRes();
  await handler(
    {
      method: 'POST',
      body: `{${'x'.repeat(70 * 1024)}`
    },
    res
  );
  assert.strictEqual(res.statusCode, 413);
}

{
  const handler = createHandler({
    env: {
      OPENAI_API_KEY: 'sk-secret-key',
      OPENAI_MODEL: 'gpt-test'
    },
    fetchImpl: async () => {
      throw new Error('should not call upstream when client sends trusted evidence fields directly');
    }
  });
  const res = createMockRes();
  await handler(
    {
      method: 'POST',
      body: {
        inventorId: 'isjian',
        patentId: '63943642',
        question: 'hello',
        knowledgePatents: []
      }
    },
    res
  );
  assert.strictEqual(res.statusCode, 400);
  assert.ok(/knowledgePatents/i.test(String(res.payload.error || '')));
}

{
  const handler = createHandler({
    env: {
      OPENAI_API_KEY: 'sk-secret-key',
      OPENAI_MODEL: 'gpt-test'
    },
    fetchImpl: async () => {
      throw new Error('should reject invalid JSON body');
    }
  });
  const res = createMockRes();
  await handler(
    {
      method: 'POST',
      body: '{"inventorId":"isjian","patentId":"63943642","question":"hello"'
    },
    res
  );
  assert.strictEqual(res.statusCode, 400);
  assert.ok(/json/i.test(String(res.payload.error || '')));
}

{
  const handler = createHandler({
    env: {
      OPENAI_API_KEY: 'sk-secret-key',
      OPENAI_MODEL: 'gpt-test'
    },
    fetchImpl: async () => {
      throw new Error('should not call upstream when client sends messages directly');
    }
  });
  const res = createMockRes();
  await handler(
    {
      method: 'POST',
      body: {
        inventorId: 'isjian',
        patentId: '63943642',
        question: 'hello',
        messages: [{ role: 'user', content: 'inject' }]
      }
    },
    res
  );
  assert.strictEqual(res.statusCode, 400);
  assert.ok(/messages/i.test(String(res.payload.error || '')));
}

{
  const handler = createHandler({
    env: {
      OPENAI_API_KEY: 'sk-secret-key',
      OPENAI_MODEL: 'gpt-test'
    },
    fetchImpl: async () => ({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      async json() {
        return {
          error: {
            message: 'invalid api key sk-secret-key'
          }
        };
      }
    })
  });
  const res = createMockRes();
  await handler(
    { method: 'POST', body: { inventorId: 'isjian', patentId: '63943642', question: 'hello' } },
    res
  );
  assert.strictEqual(res.statusCode, 502);
  assert.ok(/upstream/i.test(String(res.payload.error || '')));
  assert.ok(!/sk-secret-key/.test(JSON.stringify(res.payload)));
}

{
  const handler = createHandler({
    env: {
      OPENAI_API_KEY: 'sk-secret.key',
      OPENAI_MODEL: 'gpt-test'
    },
    fetchImpl: async () => ({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      async json() {
        return {
          error: {
            message: 'invalid api key sk-secret.key for this request'
          }
        };
      }
    })
  });
  const res = createMockRes();
  await handler(
    { method: 'POST', body: { inventorId: 'isjian', patentId: '63943642', question: 'hello' } },
    res
  );
  assert.strictEqual(res.statusCode, 502);
  const raw = JSON.stringify(res.payload);
  assert.ok(!raw.includes('sk-secret.key'));
  assert.ok(!raw.includes('.key'));
}

{
  const handler = createHandler({
    env: {
      OPENAI_API_KEY: 'plain-secret-token',
      OPENAI_MODEL: 'gpt-test'
    },
    fetchImpl: async () => ({
      ok: false,
      status: 500,
      statusText: 'ServerError',
      async json() {
        return {
          error: {
            message: 'token leak plain-secret-token should be hidden'
          }
        };
      }
    })
  });
  const res = createMockRes();
  await handler(
    { method: 'POST', body: { inventorId: 'isjian', patentId: '63943642', question: 'hello' } },
    res
  );
  assert.strictEqual(res.statusCode, 502);
  assert.ok(!/plain-secret-token/.test(JSON.stringify(res.payload)));
}

{
  const handler = createHandler({
    env: {
      OPENAI_API_KEY: 'sk-secret-key',
      OPENAI_MODEL: 'gpt-test'
    },
    fetchImpl: async () => {
      throw new Error('should reject tamper payload before upstream');
    }
  });
  const res = createMockRes();
  await handler(
    {
      method: 'POST',
      body: {
        inventorId: 'isjian',
        patentId: '63943642',
        question: 'hello',
        persona: { scholarId: 'fake', title: 'attacker override' }
      }
    },
    res
  );
  assert.strictEqual(res.statusCode, 400);
  assert.ok(/persona/i.test(String(res.payload.error || '')));
}

{
  const handler = createHandler({
    env: {
      OPENAI_API_KEY: 'sk-secret-key',
      OPENAI_MODEL: 'gpt-test'
    },
    fetchImpl: async () => {
      throw new Error('should reject oversize payload before upstream');
    }
  });
  const res = createMockRes();
  await handler(
    {
      method: 'POST',
      body: {
        inventorId: 'isjian',
        patentId: '63943642',
        question: 'hello',
        project: { description: 'x'.repeat(70 * 1024) }
      }
    },
    res
  );
  assert.strictEqual(res.statusCode, 413);
}

{
  const handler = createHandler({
    env: {
      OPENAI_API_KEY: 'sk-secret-key',
      OPENAI_MODEL: 'gpt-test'
    },
    fetchImpl: async () => {
      throw new Error('should reject long question before upstream');
    }
  });
  const res = createMockRes();
  await handler(
    {
      method: 'POST',
      body: {
        inventorId: 'isjian',
        patentId: '63943642',
        question: 'q'.repeat(4001)
      }
    },
    res
  );
  assert.strictEqual(res.statusCode, 400);
  assert.ok(/question/i.test(String(res.payload.error || '')));
}

{
  const handler = createHandler({
    env: {
      OPENAI_API_KEY: 'sk-secret-key',
      OPENAI_MODEL: 'gpt-test'
    },
    fetchImpl: async () => {
      throw new Error('should reject long history content before upstream');
    }
  });
  const res = createMockRes();
  await handler(
    {
      method: 'POST',
      body: {
        inventorId: 'isjian',
        patentId: '63943642',
        question: 'hello',
        history: [{ role: 'user', content: 'h'.repeat(1001) }]
      }
    },
    res
  );
  assert.strictEqual(res.statusCode, 400);
  assert.ok(/history/i.test(String(res.payload.error || '')));
}

for (const primitiveBody of ['null', '"str"', '123', 'true']) {
  const handler = createHandler({
    env: {
      OPENAI_API_KEY: 'sk-secret-key',
      OPENAI_MODEL: 'gpt-test'
    },
    fetchImpl: async () => {
      throw new Error('should reject non-object JSON before upstream');
    }
  });
  const res = createMockRes();
  await handler({ method: 'POST', body: primitiveBody }, res);
  assert.strictEqual(res.statusCode, 400);
  assert.ok(/json object/i.test(String(res.payload.error || '')));
}

{
  const upstreamCalls = [];
  const handler = createHandler({
    env: {
      OPENAI_API_KEY: 'sk-secret-key',
      OPENAI_MODEL: 'gpt-test'
    },
    fetchImpl: async (url, options) => {
      upstreamCalls.push({ url, options });
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        async json() {
          return { choices: [{ message: { content: 'ok' } }] };
        }
      };
    }
  });
  const history = [{ role: 'user', content: 'DROP_ME' }].concat(
    Array.from({ length: 12 }).map((_, index) => ({
      role: index % 2 ? 'assistant' : 'user',
      content: `KEEP_${index + 1}`
    }))
  );
  const res = createMockRes();
  await handler(
    {
      method: 'POST',
      body: {
        inventorId: 'isjian',
        patentId: '63943642',
        question: 'latest',
        history
      }
    },
    res
  );
  assert.strictEqual(res.statusCode, 200);
  const requestBody = JSON.parse(upstreamCalls[0].options.body);
  assert.deepStrictEqual(requestBody.messages.map(item => item.role), ['system', 'user']);
  assert.ok(!requestBody.messages[0].content.includes('DROP_ME'));
  assert.ok(requestBody.messages[0].content.includes('KEEP_1'));
}

console.log('api-chat tests passed');
