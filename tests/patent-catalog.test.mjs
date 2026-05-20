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

const { ScholarMateBusinessCore: BusinessCore, ScholarMate, patents, inventors, patentDetails } = sandbox;

assert.ok(patents.length >= 24 && patents.length <= 30, `expected 24-30 patents, got ${patents.length}`);
assert.ok(inventors.length >= 10 && inventors.length <= 12, `expected 10-12 scholars, got ${inventors.length}`);
assert.strictEqual(new Set(patents.map(patent => patent.id)).size, patents.length, 'patent ids should be unique');

const scholarById = new Map(inventors.map(inventor => [inventor.id, inventor]));
const inventorIds = new Set(inventors.map(inventor => inventor.id));

assert.ok(inventors.every(inventor => Array.isArray(inventor.patentIds) && inventor.patentIds.length >= 2 && inventor.patentIds.length <= 3), 'each scholar should own 2-3 patent ids');
assert.ok(!inventors.some(inventor => /picsum|dicebear/i.test(JSON.stringify(inventor))), 'scholar core data should not include picsum/dicebear assets');

for (const patent of patents) {
  assert.ok(inventorIds.has(patent.inventorId), `${patent.id} should reference an inventor`);

  const scholar = scholarById.get(patent.inventorId);
  assert.ok(scholar, `${patent.id} should resolve scholar by inventorId`);
  assert.strictEqual(patent.leadInventor, scholar.name, `${patent.id} leadInventor should match scholar name`);
  assert.ok(scholar.patentIds.includes(patent.id), `${patent.id} should be listed in scholar patentIds`);

  assert.ok(patent.sourceName === '科研之友专利库', `${patent.id} should use localized source label`);
  assert.ok(/^https:\/\/patents\.google\.com\/patent\//.test(String(patent.sourceUrl || '')), `${patent.id} should keep internal traceability URL`);
  assert.ok(!/^ZL2024/.test(patent.id), `${patent.id} should not use fake legacy IDs`);

  assert.ok(Array.isArray(patent.inventors) && patent.inventors.length >= 1, `${patent.id} should expose inventor array`);
  assert.ok(typeof patent.assignee === 'string' && patent.assignee.length >= 3, `${patent.id} should expose assignee`);
  assert.ok(typeof patent.applicationNumber === 'string' && patent.applicationNumber.length >= 5, `${patent.id} should expose application number`);
  assert.ok(Boolean(patent.filingDate || patent.priorityDate), `${patent.id} should expose filingDate or priorityDate`);
  assert.ok(typeof patent.publicationDate === 'string' && patent.publicationDate.length >= 8, `${patent.id} should expose publication date`);
  assert.ok(typeof patent.legalStatus === 'string' && patent.legalStatus.length >= 3, `${patent.id} should expose legal status`);
  assert.ok(/法律状态需二次核验/.test(String(patent.statusNote || '')), `${patent.id} should expose localized legal caveat`);
  assert.ok(/本页面不构成许可结论/.test(String(patent.statusNote || '')), `${patent.id} should expose localized license caveat`);
  assert.ok(!/Google Patents/i.test(String(patent.statusNote || '')), `${patent.id} caveat should hide Google branding`);
  assert.ok(/^assets\/patents\/[A-Z0-9]+\.png$/.test(String(patent.imageUrl || '')), `${patent.id} should use a local downloaded patent image asset`);
  assert.ok(Number.isFinite(Number(patent.imageWidth)) && Number(patent.imageWidth) > 0, `${patent.id} should expose imageWidth`);
  assert.ok(Number.isFinite(Number(patent.imageHeight)) && Number(patent.imageHeight) > 0, `${patent.id} should expose imageHeight`);
  assert.ok(['high', 'low'].includes(String(patent.imageQuality || '')), `${patent.id} should expose imageQuality`);
  const localImageUrl = new URL(`../${patent.imageUrl}`, import.meta.url);
  assert.ok(fs.existsSync(localImageUrl), `${patent.id} local patent image should exist`);
  assert.ok(fs.statSync(localImageUrl).size > 0, `${patent.id} local patent image should not be empty`);
  assert.ok(patent.pdfUrl && /^https?:\/\//.test(patent.pdfUrl), `${patent.id} should keep internal PDF/source trace URL`);

  assert.ok(Array.isArray(patent.keywords) && patent.keywords.length >= 4, `${patent.id} should include search keywords`);

  assert.ok(patentDetails[patent.id], `${patent.id} should have detail pricing metadata`);
  assert.strictEqual(typeof patentDetails[patent.id].requireLicense, 'boolean', `${patent.id} should define requireLicense in detail metadata`);
  assert.ok(Number.isFinite(Number(patentDetails[patent.id].price)), `${patent.id} should define numeric price in detail metadata`);
  assert.ok(Number.isFinite(Number(patentDetails[patent.id].licensePrice)), `${patent.id} should define numeric licensePrice in detail metadata`);
}

for (const patent of patents) {
  const mediaHtml = ScholarMate.createPatentMediaHtml(patent, 'card');
  assert.ok(!/patents\.google\.com/i.test(mediaHtml), `${patent.id} rendered media link should not expose patents.google.com`);
  assert.ok(!/patentimages\.storage\.googleapis\.com/i.test(mediaHtml), `${patent.id} rendered media link should not expose patentimages.storage.googleapis.com`);
  if (patent.imageQuality === 'low') {
    assert.ok(!/patent-card__image/.test(mediaHtml), `${patent.id} low quality images should not be rendered as card image`);
    assert.ok(/patent-document-preview/.test(mediaHtml), `${patent.id} low quality images should fall back to document preview`);
  } else {
    assert.ok(/patent-card__image/.test(mediaHtml), `${patent.id} high quality images should render image`);
    assert.ok(/patent-card__image--contain/.test(mediaHtml), `${patent.id} high quality images should render contain-fit class`);
  }
}

for (const patent of patents.slice(0, 5)) {
  const cardHtml = ScholarMate.createPatentCardHtml(patent, 1);
  assert.ok(!/patents\.google\.com/i.test(cardHtml), `${patent.id} rendered card should not expose patents.google.com`);
  assert.ok(!/patentimages\.storage\.googleapis\.com/i.test(cardHtml), `${patent.id} rendered card should not expose patentimages.storage.googleapis.com`);
}

assert.ok(
  /patent-detail\.html\?id=CN115062165A/.test(ScholarMate.getSafePublicDocHref('https://patentimages.storage.googleapis.com/demo/path.pdf', 'CN115062165A')),
  'safe href helper should fallback to local detail for patentimages.storage.googleapis.com'
);
assert.ok(
  /patent-detail\.html\?id=CN115062165A/.test(ScholarMate.getSafePublicDocHref('https://patents.google.com/patent/CN115062165A/zh', 'CN115062165A')),
  'safe href helper should fallback to local detail for patents.google.com'
);

const ENGLISH_INSTITUTION = /University|Institute of|Co Ltd|Corporation/i;
for (const inventor of inventors) {
  assert.ok(!ENGLISH_INSTITUTION.test(String(inventor.affiliation || '')), `${inventor.id} affiliation should be Chinese`);
  const svg = decodeURIComponent(String(inventor.avatar || '').split(',')[1] || '');
  assert.ok(!ENGLISH_INSTITUTION.test(svg), `${inventor.id} avatar aria-label should not include English institutions`);
}
for (const patent of patents) {
  assert.ok(!ENGLISH_INSTITUTION.test(String(patent.assignee || '')), `${patent.id} assignee should be Chinese`);
}

function expectedDerivedPrice(patent) {
  const scholar = scholarById.get(patent.inventorId) || {};
  const status = String(patent.legalStatus || '');
  if (patent.trialAccess || patent.commercialFit === 'trial') return 0;
  if (patent.commercialFit === 'narrow' || /Expired|Withdrawn/i.test(status)) return 1999;
  if ((scholar.affiliationTier === 'top_university' || scholar.affiliationTier === 'national_institute') && (patent.commercialFit === 'high' || /Active|Granted/i.test(status))) return 3999;
  return 2999;
}

for (const patent of patents) {
  assert.strictEqual(patent.price, expectedDerivedPrice(patent), `${patent.id} price should follow the rule-derived pricing matrix`);
  assert.strictEqual(patent.requireLicense, patent.price > 0, `${patent.id} requireLicense should follow derived price`);
  assert.ok(typeof patent.pricingBasis === 'string' && patent.pricingBasis.length > 10, `${patent.id} should expose pricing basis`);
  assert.strictEqual(patentDetails[patent.id].price, patent.price, `${patent.id} detail price should be derived from catalog rules`);
  assert.strictEqual(patentDetails[patent.id].licensePrice, patent.licensePrice, `${patent.id} detail licensePrice should match derived catalog price`);
}

const verifiedCn115062165 = patents.find(patent => patent.id === 'CN115062165A');
assert.ok(verifiedCn115062165, 'CN115062165A should be present');
assert.strictEqual(verifiedCn115062165.applicationNumber, 'CN202210995624.6A');
assert.match(verifiedCn115062165.legalStatus, /Granted|Active/);
assert.strictEqual(verifiedCn115062165.leadInventor, '李传富');

const corePages = ['../patent-list.html', '../patent-detail.html', '../chat.html', '../user-center.html', '../patent-publish.html'];
for (const page of corePages) {
  const source = fs.readFileSync(new URL(page, import.meta.url), 'utf8');
  assert.ok(!/Google Patents/.test(source), `${page} should not expose Google Patents branding in user-visible copy`);
  assert.ok(!/patentimages\.storage\.googleapis\.com/.test(source), `${page} should not hardcode patentimages storage URLs in user-visible markup`);
  assert.ok(!/ZL2024|picsum|dicebear|138-1234-5678|13812345678/.test(source), `${page} should not contain fake patent IDs, placeholder images, fabricated portraits, or fake phone numbers`);
}

const detailPageSource = fs.readFileSync(new URL('../patent-detail.html', import.meta.url), 'utf8');
assert.ok(detailPageSource.includes('ScholarMate.shouldRenderPatentImage(currentPatent)'), 'detail page should branch local figure rendering on image quality helper');
assert.ok(detailPageSource.includes('ScholarMate.getSafePublicDocHref(currentPatent.pdfUrl, currentPatent.id)'), 'detail page should sanitize public document links');
assert.ok(!/currentPatent\.sourceUrl\)\}" target="_blank"/.test(detailPageSource), 'detail page should not render sourceUrl as direct external button');
assert.ok(!/picsum|dicebear/i.test(JSON.stringify(patents)), 'patent core data should not include picsum/dicebear assets');

function topIdsForQuery(query, minScore = 20, limit = 8) {
  return BusinessCore.rankPatentsHybrid({ query, patents })
    .filter(item => item.score >= minScore)
    .slice(0, limit)
    .map(item => item.patentId);
}

function assertTopContains(query, expectedIds) {
  const ids = topIdsForQuery(query);
  assert.ok(ids.length > 0, `query "${query}" should return ranked candidates`);
  assert.ok(
    ids.some(id => expectedIds.includes(id)),
    `query "${query}" should surface one of ${expectedIds.join(', ')} near top, got ${ids.join(', ')}`
  );
}

assertTopContains('医学影像 诊断 报告 标注 知识图谱', ['CN115062165A', 'CN115512810A', 'CN114240935B', 'CN115132314A']);
assertTopContains('动力电池 热失控 安全 评价 抑制', ['CN115051051A', 'CN110109020A', 'CN110045287A', 'CN104346524A', 'CN112029343A']);
assertTopContains('联邦学习 隐私 参与者 权重 室内定位', ['CN110503207A', 'CN110610242A', 'CN110632554A']);
assertTopContains('工业 缺陷 检测 小样本 金属 MiniLED 玻璃', ['CN119090851A', 'CN114092389A', 'CN113888477B']);
assertTopContains('草地贪夜蛾 虫情 监测 预警 植保 无人机', ['CN114550108B', 'CN114170513B', 'CN115316172A', 'CN116171962B']);
assertTopContains('电力系统 低碳 碳排放 计量 调度', ['CN105046353A', 'CN106251095B']);
assertTopContains('蛋白质 聚氨基酸 偶联 生成 生物材料', ['CN106924753A', 'CN111388679A', 'CN106924752B']);

console.log('patent catalog tests passed');
