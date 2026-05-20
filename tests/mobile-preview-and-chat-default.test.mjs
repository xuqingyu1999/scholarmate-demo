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

assert.ok(!/llmConfigPanel/.test(chatHtml), 'chat page should remove LLM credential config panel');
assert.ok(!/sessionStorage/i.test(chatHtml), 'chat page should not mention sessionStorage secret flow');
assert.ok(!/llmApiKey|llmBaseURL|llmModel/.test(chatHtml), 'chat page should not include API key/baseURL/model inputs');
assert.ok(
  chatHtml.includes('LlmClient.sendAdvisorChat({') && !chatHtml.includes('config,'),
  'chat page should call sendAdvisorChat without user-configured secret payload'
);
assert.ok(
  chatHtml.includes('inventorId: inventor.id') && chatHtml.includes('patentId: patent.id'),
  'chat page should send only inventorId/patentId identifiers to serverless proxy'
);
assert.ok(
  !chatHtml.includes('LlmClient.sendAdvisorChat({\n                    persona: currentPersona')
    && !chatHtml.includes('LlmClient.sendAdvisorChat({\n                    knowledgePatents: currentScholarPatents'),
  'chat page should not send full persona/evidence objects in serverless payload'
);
assert.ok(
  chatHtml.includes("provider: 'serverless-openai-compatible'") && chatHtml.includes("provider: 'local-demo'"),
  'chat sessions should use serverless/local-demo provider tags'
);
assert.ok(
  chatHtml.includes('id="chatWorkbenchLink"') && chatHtml.includes('id="chatWorkbenchHeaderLink"'),
  'chat page should expose return-to-homepage links'
);
assert.ok(
  chatHtml.includes('function buildWorkbenchReturnHref') && chatHtml.includes('mode: \'advisor\'') && chatHtml.includes('params.set(\'q\', restoredQuestion)'),
  'chat page should build a homepage advisor return URL with the current question'
);
assert.ok(
  chatHtml.includes('id="chatBackLink"') && chatHtml.includes('id="chatDetailHeaderLink"'),
  'chat page should keep patent-detail actions visible'
);
assert.ok(
  chatHtml.includes('assets/scholars/personas.json') && chatHtml.includes('loadPersonas'),
  'chat page should load static personas with runtime fallback handling'
);
assert.ok(
  chatHtml.includes('renderEvidenceCard') && chatHtml.includes('evidenceItems.length') && chatHtml.includes('chat-evidence'),
  'chat page should render evidence card collapsed label'
);
assert.ok(
  chatHtml.includes('resolveEvidencePatents({') && chatHtml.includes('patents: currentScholarPatents'),
  'chat evidence resolution should use scholar-scoped patents instead of full catalog'
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

