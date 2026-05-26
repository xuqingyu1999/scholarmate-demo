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

assert.strictEqual(patents.length, 16, `expected 16 CityU patents, got ${patents.length}`);
assert.strictEqual(inventors.length, 9, `expected 9 first-CityU-scholar advisors, got ${inventors.length}`);
assert.strictEqual(new Set(patents.map(patent => patent.id)).size, patents.length, 'patent ids should be unique');

const scholarById = new Map(inventors.map(inventor => [inventor.id, inventor]));
const inventorIds = new Set(inventors.map(inventor => inventor.id));

for (const inventor of inventors) {
  assert.ok(Array.isArray(inventor.patentIds) && inventor.patentIds.length >= 1, `${inventor.id} should own at least one patent`);
  assert.ok(Array.isArray(inventor.expertise) && inventor.expertise.length >= 1, `${inventor.id} should include expertise`);
  assert.ok(Array.isArray(inventor.paperBackground) && inventor.paperBackground.length >= 1, `${inventor.id} should include paper background`);
  assert.ok(inventor.rules && typeof inventor.rules === 'object', `${inventor.id} should include digital scholar rules`);
  assert.ok(Array.isArray(inventor.identityRules) && inventor.identityRules.length >= 1, `${inventor.id} should include identity rules`);
  assert.ok(Array.isArray(inventor.evidenceRules) && inventor.evidenceRules.length >= 1, `${inventor.id} should include evidence rules`);
  assert.ok(Array.isArray(inventor.scholarRules) && inventor.scholarRules.length >= 1, `${inventor.id} should include scholar rules`);
  assert.ok(Array.isArray(inventor.patentRules) && inventor.patentRules.some(rule => rule.id === 'patent_first'), `${inventor.id} should include patent-first rule`);
  assert.strictEqual(
    Array.from(inventor.skills.map(skill => skill.id)).join(','),
    ['patent_fact_extractor', 'paper_evidence_retriever', 'commercialization_assessor', 'technical_due_diligence', 'risk_guard', 'citation_answer_builder'].join(','),
    `${inventor.id} should expose the fixed digital scholar skills`
  );
  assert.ok(inventor.sessionContext && inventor.sessionContext.selectedPatentPolicy === 'active_patent_first', `${inventor.id} should include session context policy`);
  assert.ok(Array.isArray(inventor.paperMemory) && inventor.paperMemory.length === inventor.paperBackground.length, `${inventor.id} should expose normalized paper memory`);
  assert.ok(Array.isArray(inventor.patentMemory) && inventor.patentMemory.length === inventor.patentIds.length, `${inventor.id} should expose patent memory`);
  assert.ok(inventor.knowledgeIndex && inventor.knowledgeIndex.path, `${inventor.id} should expose a knowledge index path`);
  assert.ok(/^data:image\/svg\+xml/.test(inventor.avatar), `${inventor.id} should keep generated initials avatar style`);

  const manifestUrl = new URL(`../assets/scholars/${inventor.id}/papers/manifest.json`, import.meta.url);
  assert.ok(fs.existsSync(manifestUrl), `${inventor.id} paper manifest should exist`);
  const manifest = JSON.parse(fs.readFileSync(manifestUrl, 'utf8'));
  const knowledgeUrl = new URL(`../${inventor.knowledgeIndex.path}`, import.meta.url);
  assert.ok(fs.existsSync(knowledgeUrl), `${inventor.id} knowledge index should exist`);
  const knowledgeIndex = JSON.parse(fs.readFileSync(knowledgeUrl, 'utf8'));
  assert.strictEqual(knowledgeIndex.scholarId, inventor.id, `${inventor.id} knowledge index should identify scholar`);
  assert.strictEqual(knowledgeIndex.paperCount, manifest.papers.length, `${inventor.id} knowledge index should count papers`);
  assert.ok(Array.isArray(knowledgeIndex.chunks), `${inventor.id} knowledge index should expose chunks`);
  assert.ok(Array.isArray(knowledgeIndex.metadataRecords), `${inventor.id} knowledge index should expose metadata-only records`);
  assert.ok(Array.isArray(manifest.papers) && manifest.papers.length >= 3, `${inventor.id} paper manifest should list at least 3 background records`);
  for (const paper of manifest.papers) {
    assert.ok(paper.paperId, `${inventor.id} paper should have stable paperId`);
    assert.ok(['downloaded_pdf', 'metadata_only'].includes(paper.downloadStatus), `${inventor.id} paper status should be explicit`);
    assert.ok(typeof paper.sourceUrl === 'string', `${inventor.id} paper should retain sourceUrl`);
    assert.ok(typeof paper.description === 'string' && paper.description.length >= 10, `${inventor.id} paper should include description`);
    assert.ok(typeof paper.confidence === 'string' && paper.confidence.length >= 3, `${inventor.id} paper should include confidence`);
    if (paper.downloadStatus === 'downloaded_pdf') {
      assert.ok(paper.file, `${inventor.id} downloaded paper should expose local file`);
      const paperPath = new URL(`../${paper.file}`, import.meta.url);
      assert.ok(fs.existsSync(paperPath), `${paper.file} should exist`);
      const paperBytes = fs.readFileSync(paperPath);
      assert.ok(paperBytes.length > 1000, `${paper.file} should not be empty`);
      assert.strictEqual(paperBytes.subarray(0, 4).toString(), '%PDF', `${paper.file} should be a PDF`);
      const chunks = knowledgeIndex.chunks.filter(chunk => chunk.paperId === paper.paperId);
      assert.ok(chunks.length >= 1, `${paper.file} should produce at least one knowledge chunk`);
      assert.ok(chunks.every(chunk => chunk.sourceType === 'paper_pdf' && typeof chunk.text === 'string' && chunk.text.length >= 80), `${paper.file} chunks should be non-empty PDF evidence`);
    } else {
      assert.ok(!knowledgeIndex.chunks.some(chunk => chunk.paperId === paper.paperId), `${inventor.id} metadata-only paper should not produce full-text chunks`);
      assert.ok(knowledgeIndex.metadataRecords.some(record => record.paperId === paper.paperId), `${inventor.id} metadata-only paper should be retained as metadata evidence`);
    }
  }
}

const zhaoManifest = JSON.parse(fs.readFileSync(new URL('../assets/scholars/zhao_jianliang_leon/papers/manifest.json', import.meta.url), 'utf8'));
assert.ok(zhaoManifest.profileUrls.some(url => /jlzhao|leonzhao|JLeonZhao/i.test(url)), 'Zhao manifest should include curated profile URLs');
assert.strictEqual(zhaoManifest.googleScholarUrl, 'https://scholar.google.com/citations?user=qCyjuogAAAAJ', 'Zhao manifest should include Google Scholar profile');
assert.ok(zhaoManifest.papers.length >= 5, 'Zhao should have at least 5 curated background records');
assert.ok(zhaoManifest.papers.filter(paper => paper.downloadStatus === 'downloaded_pdf').length >= 3, 'Zhao should have at least 3 downloaded public PDFs');
const zhaoKnowledge = JSON.parse(fs.readFileSync(new URL('../assets/scholars/zhao_jianliang_leon/knowledge/index.json', import.meta.url), 'utf8'));
assert.ok(zhaoKnowledge.chunkCount >= 3, 'Zhao should have downloaded PDF knowledge chunks');
assert.ok(zhaoKnowledge.chunks.some(chunk => /blockchain|digital finance|smart contract/i.test(`${chunk.title} ${chunk.text}`)), 'Zhao knowledge chunks should include blockchain-related evidence');

const maPatents = patents.filter(patent => patent.inventorId === 'isjian').map(patent => patent.id).sort();
assert.strictEqual(maPatents.join(','), '63943642,63943652', 'the first two provisional patent records should belong to MA, Jian');

for (const patent of patents) {
  assert.ok(inventorIds.has(patent.inventorId), `${patent.id} should reference a valid digital advisor`);
  const scholar = scholarById.get(patent.inventorId);
  assert.strictEqual(patent.leadInventor, scholar.name, `${patent.id} leadInventor should match selected CityU scholar`);
  assert.ok(scholar.patentIds.includes(patent.id), `${patent.id} should be listed on scholar patentIds`);

  assert.strictEqual(patent.sourceName, 'CityUHK Scholars', `${patent.id} should use CityUHK Scholars source`);
  assert.ok(/^https:\/\/scholars\.cityu\.edu\.hk\/en\/publications\//.test(String(patent.sourceUrl || '')), `${patent.id} should expose CityUHK Scholars publication URL`);
  assert.ok(!/^ZL2024/.test(patent.id), `${patent.id} should not use fake legacy IDs`);

  assert.ok(Array.isArray(patent.inventors) && patent.inventors.length >= 1, `${patent.id} should expose inventor array`);
  assert.ok(typeof patent.assignee === 'string' && patent.assignee.length >= 3, `${patent.id} should expose assignee`);
  assert.ok(typeof patent.applicationNumber === 'string' && patent.applicationNumber.length >= 5, `${patent.id} should expose application number`);
  assert.ok(Boolean(patent.filingDate || patent.priorityDate), `${patent.id} should expose filingDate or priorityDate`);
  assert.ok(typeof patent.publicationDate === 'string' && patent.publicationDate.length >= 4, `${patent.id} should expose publication date`);
  assert.ok(typeof patent.legalStatus === 'string' && patent.legalStatus.length >= 3, `${patent.id} should expose legal status`);
  assert.ok(/CityUHK Scholars/i.test(String(patent.statusNote || '')), `${patent.id} should keep CityU source caveat`);
  assert.ok(Array.isArray(patent.keywords) && patent.keywords.length >= 4, `${patent.id} should include search keywords`);

  if (patent.localOriginal) {
    assert.ok(fs.existsSync(new URL(`../${patent.localOriginal}`, import.meta.url)), `${patent.id} local original should exist`);
    assert.ok(/^assets\/patents\/[A-Z0-9]+\.png$/.test(String(patent.imageUrl || '')), `${patent.id} should use generated local patent image asset`);
    const localImageUrl = new URL(`../${patent.imageUrl}`, import.meta.url);
    assert.ok(fs.existsSync(localImageUrl), `${patent.id} local patent image should exist`);
    assert.ok(fs.statSync(localImageUrl).size > 0, `${patent.id} local patent image should not be empty`);
  } else {
    assert.strictEqual(patent.imageUrl, '', `${patent.id} without public patent original should use document-preview fallback`);
    assert.ok(/^https:\/\/hdl\.handle\.net\//.test(String(patent.pdfUrl || '')), `${patent.id} fallback should point to CityU handle/fulltext URL`);
  }

  assert.ok(patentDetails[patent.id], `${patent.id} should have detail pricing metadata`);
  assert.strictEqual(typeof patentDetails[patent.id].requireLicense, 'boolean', `${patent.id} should define requireLicense in detail metadata`);
  assert.ok(Number.isFinite(Number(patentDetails[patent.id].price)), `${patent.id} should define numeric price in detail metadata`);
  assert.ok(Number.isFinite(Number(patentDetails[patent.id].licensePrice)), `${patent.id} should define numeric licensePrice`);
}

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
    `query "${query}" should surface one of ${expectedIds.join(', ')}, got ${ids.join(', ')}`
  );
}

assertTopContains('large language model patent recommendation quality heterogeneous data', ['63943642', '63943652']);
assertTopContains('blockchain private key anti ddos middleware trust', ['CN117950627A', 'CN114117510B', 'CN114513317B', 'CN114077631A']);
assertTopContains('bionic thermal regulating fabric textile sensor', ['CN119563958A', 'US12571139B2']);
assertTopContains('radar weak respiratory signal medical sensing', ['CN112137620B']);
assertTopContains('visual tracking image electronic system', ['CN111104831B', 'US10432907B2']);
assertTopContains('textual data search electronic documents query', ['US11386164B2', 'US10747759B2']);

const corePages = ['../patent-list.html', '../patent-detail.html', '../chat.html', '../user-center.html', '../patent-publish.html'];
for (const page of corePages) {
  const source = fs.readFileSync(new URL(page, import.meta.url), 'utf8');
  assert.ok(!/ZL2024|picsum|dicebear|138-1234-5678|13812345678/.test(source), `${page} should not contain fake patent IDs, placeholder images, fabricated portraits, or fake phone numbers`);
}
assert.ok(!/picsum|dicebear/i.test(JSON.stringify(patents)), 'patent core data should not include picsum/dicebear assets');

console.log('patent catalog tests passed');
