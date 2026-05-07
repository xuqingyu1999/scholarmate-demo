import assert from 'node:assert';
import fs from 'node:fs';
import vm from 'node:vm';

const coreSource = fs.readFileSync(new URL('../scripts/business-core.js', import.meta.url), 'utf8');
const semanticSource = fs.readFileSync(new URL('../scripts/semantic-search.js', import.meta.url), 'utf8');
const storage = new Map();
const sandbox = {
  console,
  localStorage: {
    getItem: key => storage.get(key) || null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: key => storage.delete(key)
  },
  setTimeout,
  clearTimeout
};

vm.createContext(sandbox);
vm.runInContext(coreSource, sandbox);
vm.runInContext(semanticSource, sandbox);

const patents = [
  {
    id: 'med',
    title: 'AI medical imaging diagnosis',
    field: '人工智能',
    industry: '医疗健康',
    summary: '基层医院医学影像辅助诊断',
    inventorId: 'inv_001',
    requireLicense: false
  },
  {
    id: 'bat',
    title: 'battery thermal runaway safety',
    field: '新能源',
    industry: '新能源汽车',
    summary: '电池高温安全 热失控管理',
    inventorId: 'inv_002',
    requireLicense: true,
    licensePrice: 2999
  }
];

const result = await sandbox.ScholarMateSemanticSearch.rank({
  query: '基层医院影像诊断效率提升',
  patents,
  project: { industry: '医疗健康', stage: '试点验证', title: '影像诊断' },
  forceFallback: true
});

assert.strictEqual(result.usedSemanticModel, false);
assert.strictEqual(result.items[0].patentId, 'med');
assert.ok(result.notice.includes('回退'));
assert.ok(sandbox.ScholarMateSemanticSearch.buildPatentDocument(patents[0]).includes('医学影像'));
assert.strictEqual(typeof sandbox.ScholarMateSemanticSearch.retry, 'function');
assert.strictEqual(sandbox.ScholarMateSemanticSearch.retry().status, 'retrying');
assert.notStrictEqual(
  sandbox.ScholarMateSemanticSearch.cacheKey({ ...patents[0], summary: '基层医院医学影像辅助诊断' }),
  sandbox.ScholarMateSemanticSearch.cacheKey({ ...patents[0], summary: '基层医院医学影像风险分层' })
);

console.log('semantic-search tests passed');
