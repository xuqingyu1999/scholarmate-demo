import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const detailHtml = fs.readFileSync(new URL('../patent-detail.html', import.meta.url), 'utf8');
const chatHtml = fs.readFileSync(new URL('../chat.html', import.meta.url), 'utf8');
const coreSource = fs.readFileSync(new URL('../scripts/business-core.js', import.meta.url), 'utf8');
const mainSource = fs.readFileSync(new URL('../scripts/main.js', import.meta.url), 'utf8');

const forbiddenDetailMarkers = [
  'CN115062165A',
  '医学影像',
  '早期癌症筛查',
  '基层医疗机构',
  'Google Patents 公开记录',
  'detailFigureGrid',
  'links.slice(0, 2)'
];

for (const marker of forbiddenDetailMarkers) {
  assert.equal(
    detailHtml.includes(marker),
    false,
    `patent-detail.html should not include unverified legacy detail marker: ${marker}`
  );
}

assert.match(
  detailHtml,
  /renderVerifiedPatentSections/,
  'patent detail should render background/invention/figure sections only through verified section data'
);
assert.match(
  detailHtml,
  /verifiedSections/,
  'patent detail should look for verifiedSections before rendering detailed patent sections'
);

assert.equal(chatHtml.includes('正在调用服务端顾问回复'), false, 'chat should not expose remote-service waiting copy');
assert.equal(chatHtml.includes('正在思考...'), true, 'chat should use neutral thinking copy while waiting');
assert.equal(detailHtml.includes('问数字顾问'), false, 'detail page should not use generic advisor CTA copy');
assert.match(detailHtml, /formatProfessorCta/, 'detail page should build professor-specific CTA labels');
assert.match(detailHtml, /问教授/, 'detail page should include a neutral professor fallback CTA');

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
    body: { appendChild() {}, insertBefore() {}, firstChild: null, classList: { add() {}, remove() {}, toggle() {} } }
  },
  window: {
    location: { pathname: '/patent-detail.html', hash: '', search: '', origin: 'http://127.0.0.1:8123' },
    addEventListener() {}
  },
  localStorage: {
    getItem() { return null; },
    setItem() {},
    removeItem() {},
    key() { return null; },
    length: 0
  },
  URL,
  URLSearchParams
};

vm.createContext(sandbox);
vm.runInContext(coreSource, sandbox);
vm.runInContext(`${mainSource}\nthis.patents = patents; this.inventors = inventors;`, sandbox);

assert.equal(sandbox.patents.length, 16, 'CityU catalog should still expose 16 patents');
for (const patent of sandbox.patents) {
  assert.ok(patent.detailEvidenceAudit, `${patent.id} should expose a detail evidence audit`);
  assert.equal(
    patent.detailEvidenceAudit.hasLocalOriginal,
    Boolean(patent.localOriginal),
    `${patent.id} audit should reflect local original availability`
  );
  assert.ok(
    ['metadata_only', 'local_original_available'].includes(patent.detailEvidenceAudit.originalStatus),
    `${patent.id} audit should use an explicit original status`
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(patent.verifiedSections || {})),
    {},
    `${patent.id} should not expose unverified detailed sections yet`
  );
}

const metadataOnly = sandbox.patents.filter(patent => !patent.localOriginal).map(patent => patent.id).sort();
assert.deepEqual(JSON.parse(JSON.stringify(metadataOnly)), ['63943642', '63943652'], 'only the two provisional CityU records should be metadata-only');

console.log('patent detail evidence tests passed');
