import assert from 'node:assert';
import fs from 'node:fs';
import vm from 'node:vm';

function createNode(id = '') {
  return {
    id,
    innerHTML: '',
    textContent: '',
    value: '',
    hidden: false,
    style: {},
    classList: {
      values: new Set(),
      add(value) { this.values.add(value); },
      remove(value) { this.values.delete(value); },
      toggle(value, force) {
        const shouldAdd = force === undefined ? !this.values.has(value) : !!force;
        if (shouldAdd) this.values.add(value);
        else this.values.delete(value);
        return shouldAdd;
      },
      contains(value) { return this.values.has(value); }
    },
    dataset: {},
    setAttribute(name, value) { this[name] = String(value); },
    getAttribute(name) { return this[name] || ''; },
    addEventListener() {},
    focus() {},
    remove() {},
    appendChild() {},
    querySelector() { return null; },
    querySelectorAll() { return []; }
  };
}

const nodes = new Map();
[
  'workbenchShell',
  'workbenchSidebar',
  'workbenchSidebarBody',
  'workbenchSidebarToggle',
  'workbenchSidebarOverlay',
  'workbenchPatentTab',
  'workbenchAdvisorTab',
  'workbenchResult',
  'workbenchInput',
  'workbenchInputForm'
].forEach(id => nodes.set(id, createNode(id)));

const storage = new Map();
const sandbox = {
  console,
  Date,
  Math,
  URL,
  URLSearchParams,
  encodeURIComponent,
  decodeURIComponent,
  location: {
    href: 'http://127.0.0.1:8123/index.html',
    pathname: '/index.html',
    search: '',
    hash: ''
  },
  innerWidth: 1200,
  document: {
    body: createNode('body'),
    addEventListener() {},
    getElementById(id) {
      return nodes.get(id) || null;
    },
    createElement() {
      return createNode();
    },
    querySelector() { return null; },
    querySelectorAll() { return []; }
  },
  localStorage: {
    get length() {
      return storage.size;
    },
    key(index) {
      return Array.from(storage.keys())[index] || null;
    },
    getItem(key) {
      return storage.get(key) || null;
    },
    setItem(key, value) {
      storage.set(key, String(value));
    },
    removeItem(key) {
      storage.delete(key);
    }
  },
  sessionStorage: {
    getItem() { return null; },
    setItem() {},
    removeItem() {}
  },
  confirm() { return false; },
  alert() {},
  addEventListener() {}
};
sandbox.window = sandbox;

vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(new URL('../scripts/business-core.js', import.meta.url), 'utf8'), sandbox);
vm.runInContext(`${fs.readFileSync(new URL('../scripts/chat-sessions.js', import.meta.url), 'utf8')}`, sandbox);
vm.runInContext(`${fs.readFileSync(new URL('../scripts/main.js', import.meta.url), 'utf8')}
this.ScholarMate = ScholarMate;
this.UserManager = UserManager;
this.patents = patents;
this.inventors = inventors;
this.getPatentById = getPatentById;`, sandbox);
vm.runInContext(fs.readFileSync(new URL('../scripts/workbench.js', import.meta.url), 'utf8'), sandbox);

function setUser(user) {
  storage.set('scholarmate_user', JSON.stringify(user));
}

setUser({
  isLoggedIn: true,
  name: '演示企业',
  verification: { status: 'verified' },
  purchasedLicenses: [
    'CN115062165A',
    'CN115051051A',
    'CN110503207A',
    'CN119090851A',
    'CN106924753A'
  ],
  digitalHumanSeats: [
    { inventorId: 'inv_001', patentId: 'CN115062165A', source: 'membership', joinedAt: '2026-05-14T00:00:00.000Z' },
    { inventorId: 'inv_003', patentId: 'CN110503207A', source: 'membership', joinedAt: '2026-05-14T00:00:00.000Z' }
  ],
  licensePurchasedAt: {
    'CN110503207A': '2026-05-14T00:00:00.000Z'
  }
});

const paidLicenses = sandbox.UserManager.getPurchasedLicensePatents({ paidOnly: true });
assert.strictEqual(paidLicenses.some(patent => patent.id === 'CN115062165A'), false, 'free shared patents should not count as paid licenses');
assert.ok(paidLicenses.length >= 4, 'fixture should have enough paid licenses for Top 3 ranking');

const advisorAssets = sandbox.UserManager.getAvailableAdvisorAssets();
const freeSeatAsset = advisorAssets.find(asset => asset.patentId === 'CN115062165A');
assert.ok(freeSeatAsset, 'free shared patent should become an advisor asset after joining a seat');
assert.ok(freeSeatAsset.sourceLabel.includes('顾问席位'), 'free shared seat asset should show advisor-seat source');
assert.strictEqual(freeSeatAsset.sourceLabel.includes('已购许可'), false, 'free shared purchased license alone should not be labeled as paid license');
const privacyAssets = advisorAssets.filter(asset => asset.patentId === 'CN110503207A');
assert.strictEqual(privacyAssets.length, 1, 'paid license and advisor seat for the same patent should merge into one asset');
assert.ok(privacyAssets[0].sourceLabel.includes('已购许可'));
assert.ok(privacyAssets[0].sourceLabel.includes('顾问席位'));

sandbox.ScholarMateWorkbench.setMode('advisor');
const medicalCards = sandbox.ScholarMateWorkbench.renderAdvisorCandidates('基层医院影像诊断效率提升');
assert.strictEqual(medicalCards.length, 3, 'advisor mode should render Top 3 advisor assets');
assert.strictEqual(medicalCards[0].patent.id, 'CN115062165A', 'free shared advisor-seat patent should rank first for medical query');
assert.ok(nodes.get('workbenchResult').innerHTML.includes('顾问席位'));

const cards = sandbox.ScholarMateWorkbench.renderAdvisorCandidates('金融交易隐私保护和上链合规');
assert.strictEqual(cards.length, 3, 'advisor mode should only render Top 3 advisor asset candidates');
assert.strictEqual(cards[0].patent.id, 'CN110503207A', 'privacy/blockchain advisor asset should rank first for privacy query');
assert.ok(nodes.get('workbenchResult').innerHTML.includes('深入交流'));
assert.ok(nodes.get('workbenchSidebarBody').innerHTML.includes('对话历史'), 'conversation history should be visible in advisor mode');

storage.set(sandbox.ChatSessions.STORAGE_KEY, JSON.stringify([
  {
    sessionId: 'delete_me',
    inventorId: 'inv_001',
    patentId: 'CN115062165A',
    projectId: '',
    title: '待删除会话',
    createdAt: '2026-05-16T00:00:00.000Z',
    updatedAt: '2026-05-16T00:00:00.000Z',
    provider: 'local-demo',
    model: '',
    messages: []
  },
  {
    sessionId: 'project_session',
    inventorId: 'inv_005',
    patentId: 'CN115051051A',
    projectId: 'project_123',
    title: '带项目的会话',
    createdAt: '2026-05-16T00:00:00.000Z',
    updatedAt: '2026-05-16T00:00:01.000Z',
    provider: 'local-demo',
    model: '',
    messages: []
  }
]));
sandbox.confirm = () => true;
sandbox.ScholarMateWorkbench.renderSidebar();
assert.ok(nodes.get('workbenchSidebarBody').innerHTML.includes('删除'), 'workbench sidebar history should expose a delete action');
assert.ok(
  nodes.get('workbenchSidebarBody').innerHTML.includes('project=project_123'),
  'project-bound history links should preserve project context for chat restore'
);
sandbox.ScholarMateWorkbench.deleteSession('delete_me', { preventDefault() {}, stopPropagation() {} });
assert.strictEqual(sandbox.ChatSessions.getSession('delete_me'), null, 'workbench delete action should remove only the selected session');
assert.ok(sandbox.ChatSessions.getSession('project_session'), 'workbench delete action should not delete unrelated project sessions');
assert.strictEqual(nodes.get('workbenchSidebarBody').innerHTML.includes('待删除会话'), false, 'workbench sidebar should refresh after deletion');

sandbox.ScholarMateWorkbench.startAdvisorChat('inv_001', 'CN115062165A', '请评估基层医院影像诊断试点价值');
assert.ok(String(sandbox.location.href).includes('chat.html?'));
assert.ok(String(sandbox.location.href).includes('draft='));

setUser({
  isLoggedIn: true,
  name: '只买免费专利企业',
  verification: { status: 'verified' },
  purchasedLicenses: ['CN115062165A']
});

const emptyCards = sandbox.ScholarMateWorkbench.renderAdvisorCandidates('基层医院影像诊断效率提升');
assert.strictEqual(emptyCards.length, 0, 'free shared licenses should still block deep advisor mode');
assert.ok(nodes.get('workbenchResult').innerHTML.includes('您还没有可用数字学者'));

setUser({
  isLoggedIn: true,
  name: '免费席位企业',
  verification: { status: 'verified' },
  purchasedLicenses: [],
  digitalHumanSeats: [
    { inventorId: 'inv_001', patentId: 'CN115062165A', source: 'membership', joinedAt: '2026-05-14T00:00:00.000Z' }
  ]
});

const freeSeatCards = sandbox.ScholarMateWorkbench.renderAdvisorCandidates('基层医院影像诊断效率提升');
assert.strictEqual(freeSeatCards.length, 1, 'free shared advisor seat should work without paid licenses');
assert.strictEqual(freeSeatCards[0].patent.id, 'CN115062165A');
assert.ok(nodes.get('workbenchResult').innerHTML.includes('深入交流'));

sandbox.location.search = '?mode=advisor&q=%E5%9F%BA%E5%B1%82%E5%8C%BB%E9%99%A2%E5%BD%B1%E5%83%8F%E8%AF%8A%E6%96%AD%E6%95%88%E7%8E%87%E6%8F%90%E5%8D%87';
sandbox.location.hash = '#advisor';
nodes.get('workbenchInput').value = '';
nodes.get('workbenchResult').innerHTML = '';
sandbox.ScholarMateWorkbench.init();
assert.strictEqual(nodes.get('workbenchInput').value, '基层医院影像诊断效率提升', 'advisor return URL should restore the previous homepage question');
assert.ok(nodes.get('workbenchResult').innerHTML.includes('深入交流'), 'advisor return URL should re-render candidate cards');
assert.ok(sandbox.document.body.classList.contains('workbench-has-results'), 'advisor results should switch homepage into results layout mode');

setUser({
  isLoggedIn: true,
  name: '待认证企业',
  verification: { status: 'unverified' },
  purchasedLicenses: [],
  digitalHumanSeats: []
});
sandbox.ScholarMateWorkbench.setMode('patent');
assert.ok(nodes.get('workbenchSidebarBody').innerHTML.includes('请先去企业认证'), 'unverified homepage sidebar should show verification CTA');
assert.ok(nodes.get('workbenchSidebarBody').innerHTML.includes('user-center.html?return=index.html#enterprise-verification'), 'verification CTA should preserve homepage return target');

setUser({
  isLoggedIn: true,
  name: '已认证企业',
  verification: { status: 'verified' },
  purchasedLicenses: [],
  digitalHumanSeats: []
});
sandbox.ScholarMateWorkbench.renderSidebar();
assert.strictEqual(nodes.get('workbenchSidebarBody').innerHTML.includes('请先去企业认证'), false, 'verified homepage sidebar should hide verification CTA');

sandbox.ScholarMateWorkbench.setMode('patent');
nodes.get('workbenchInput').value = '人工智能与医疗';
sandbox.ScholarMateWorkbench.submitInput();
assert.ok(String(sandbox.location.href).includes('patent-list.html?search='));

console.log('workbench tests passed');
