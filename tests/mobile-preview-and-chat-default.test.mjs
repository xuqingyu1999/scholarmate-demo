import assert from 'node:assert';
import fs from 'node:fs';
import vm from 'node:vm';

const mainSource = fs.readFileSync(new URL('../scripts/main.js', import.meta.url), 'utf8');
const chatHtml = fs.readFileSync(new URL('../chat.html', import.meta.url), 'utf8');
const userCenterHtml = fs.readFileSync(new URL('../user-center.html', import.meta.url), 'utf8');

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
    location: { pathname: '/index.html', hash: '', search: '?mobile=1' },
    addEventListener() {}
  },
  localStorage: {
    getItem() { return null; },
    setItem() {},
    removeItem() {}
  },
  URLSearchParams
};

vm.createContext(sandbox);
vm.runInContext(`${mainSource}\nthis.ScholarMate = ScholarMate; this.patents = patents;`, sandbox);

assert.strictEqual(sandbox.ScholarMate.isMobilePreviewMode({ search: '?mobile=1' }), true);
assert.strictEqual(sandbox.ScholarMate.isMobilePreviewMode({ search: '?foo=1' }), false);
assert.ok(sandbox.patents.length >= 24, `expected at least 24 patents, got ${sandbox.patents.length}`);

const unconfiguredBlock = chatHtml.match(/if \(!LlmClient\.isConfigured\(config\)\) \{([\s\S]*?)\n            \}/);
assert.ok(unconfiguredBlock, 'chat sendMessage should branch on missing LLM config');
assert.ok(
  unconfiguredBlock[1].includes('sendLocalFallbackForLastQuestion();'),
  'missing LLM config should automatically generate a local advisor reply'
);

assert.ok(
  userCenterHtml.includes('ScholarMate.getMobileBottomNavHref(`patent-detail.html?id=${encodeURIComponent(patent.id)}&project=${encodeURIComponent(project.id)}`)'),
  'user-center demand recommendations should preserve mobile preview when opening patent detail'
);
assert.ok(
  userCenterHtml.includes('ScholarMate.getMobileBottomNavHref(`chat.html?inventor=${inventorId}&patent=${encodeURIComponent(patentId)}&project=${encodeURIComponent(projectId)}`)'),
  'user-center demand recommendations should preserve mobile preview when opening advisor chat'
);

console.log('mobile preview and chat default tests passed');
