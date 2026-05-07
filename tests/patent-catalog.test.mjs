import assert from 'node:assert';
import fs from 'node:fs';
import vm from 'node:vm';

const coreSource = fs.readFileSync(new URL('../scripts/business-core.js', import.meta.url), 'utf8');
const mainSource = fs.readFileSync(new URL('../scripts/main.js', import.meta.url), 'utf8');

const sandbox = {
  console,
  document: {
    addEventListener() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    getElementById() { return null; },
    createElement() {
      return { className: '', innerHTML: '', setAttribute() {}, appendChild() {}, remove() {} };
    },
    body: { appendChild() {}, insertBefore() {}, firstChild: null, classList: { add() {}, remove() {} } }
  },
  window: {
    location: { pathname: '/patent-list.html', hash: '', search: '', origin: 'http://127.0.0.1:8123' },
    addEventListener() {}
  },
  localStorage: {
    getItem() { return null; },
    setItem() {},
    removeItem() {}
  },
  URL,
  URLSearchParams
};

vm.createContext(sandbox);
vm.runInContext(coreSource, sandbox);
vm.runInContext(`${mainSource}\nthis.ScholarMate = ScholarMate; this.patents = patents; this.inventors = inventors; this.patentDetails = patentDetails;`, sandbox);

const { ScholarMateBusinessCore: BusinessCore, patents, inventors, patentDetails } = sandbox;

assert.ok(patents.length >= 24, `expected at least 24 patents, got ${patents.length}`);
assert.strictEqual(new Set(patents.map(patent => patent.id)).size, patents.length, 'patent ids should be unique');

const inventorIds = new Set(inventors.map(inventor => inventor.id));
for (const patent of patents) {
  assert.ok(inventorIds.has(patent.inventorId), `${patent.id} should reference an inventor`);
  assert.ok(Array.isArray(patent.keywords) && patent.keywords.length >= 4, `${patent.id} should include search keywords`);
  assert.ok(patentDetails[patent.id], `${patent.id} should have detail pricing metadata`);
}

const agriculture = BusinessCore.rankPatentsHybrid({
  query: '农作物病虫害识别和农业预警',
  patents
}).filter(item => item.score >= 20);
assert.strictEqual(agriculture[0].patentId, 'ZL202410013210.9');

const carbon = BusinessCore.rankPatentsHybrid({
  query: '工业园区碳排放核算和节能诊断',
  patents
}).filter(item => item.score >= 20);
assert.strictEqual(carbon[0].patentId, 'ZL202410015678.4');

const drug = BusinessCore.rankPatentsHybrid({
  query: '药物筛选 分子活性 早期研发',
  patents
}).filter(item => item.score >= 20);
assert.strictEqual(drug[0].patentId, 'ZL202410019012.0');

console.log('patent catalog tests passed');
