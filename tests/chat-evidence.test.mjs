import assert from 'node:assert';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../scripts/chat-evidence.js', import.meta.url), 'utf8');
const mainSource = fs.readFileSync(new URL('../scripts/main.js', import.meta.url), 'utf8');

const sandbox = {
  console,
  location: { protocol: 'http:', hostname: '127.0.0.1' },
  document: {
    addEventListener() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    getElementById() { return null; },
    createElement() { return { appendChild() {}, remove() {}, classList: { add() {}, remove() {} } }; },
    body: { appendChild() {}, insertBefore() {}, firstChild: null, classList: { add() {}, remove() {} } }
  },
  localStorage: {
    getItem() { return null; },
    setItem() {},
    removeItem() {}
  },
  sessionStorage: {
    getItem() { return null; },
    setItem() {},
    removeItem() {}
  },
  URLSearchParams
};
sandbox.window = sandbox;
sandbox.addEventListener = function () {};

vm.createContext(sandbox);
vm.runInContext(`${mainSource}\nthis.patents = patents; this.inventors = inventors;`, sandbox);
vm.runInContext(source, sandbox);

const ChatEvidence = sandbox.ChatEvidence;
assert.ok(ChatEvidence && typeof ChatEvidence.extractAssistantEvidence === 'function');
assert.ok(typeof ChatEvidence.resolveEvidencePatents === 'function');
assert.ok(typeof ChatEvidence.warnPersonaBoundaryHints === 'function');

const parsed = ChatEvidence.extractAssistantEvidence('Answer body.\n【依据】63943642, 63943652');
assert.strictEqual(parsed.visibleContent, 'Answer body.');
assert.deepStrictEqual(JSON.parse(JSON.stringify(parsed.patentIds)), ['63943642', '63943652']);

const noMarker = ChatEvidence.extractAssistantEvidence('No marker here');
assert.strictEqual(noMarker.visibleContent, 'No marker here');
assert.strictEqual(noMarker.patentIds.length, 0);

const resolved = ChatEvidence.resolveEvidencePatents({
  patentIds: parsed.patentIds,
  patents: sandbox.patents,
  inventors: sandbox.inventors
});
assert.strictEqual(resolved.length, 2);
assert.strictEqual(resolved[0].id, '63943642');
assert.ok(resolved[0].href.endsWith('patent-detail.html?id=63943642'));
assert.ok(resolved[0].title && resolved[0].publicationNumber && resolved[0].scholarName);

const scopedPatents = sandbox.patents.filter(patent => patent.inventorId === 'isjian');
const scopedResolved = ChatEvidence.resolveEvidencePatents({
  patentIds: ['63943642', 'CN117950627A'],
  patents: scopedPatents,
  inventors: sandbox.inventors
});
assert.strictEqual(scopedResolved.length, 1, 'off-scope patent IDs should not resolve from scoped patents');
assert.strictEqual(scopedResolved[0].id, '63943642');

console.log('chat evidence tests passed');

