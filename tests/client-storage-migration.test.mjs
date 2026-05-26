import assert from 'node:assert';
import fs from 'node:fs';
import vm from 'node:vm';

const coreSource = fs.readFileSync(new URL('../scripts/business-core.js', import.meta.url), 'utf8');
const mainSource = fs.readFileSync(new URL('../scripts/main.js', import.meta.url), 'utf8');

function createStorage(seed = {}) {
  const store = new Map(Object.entries(seed));
  return {
    get length() {
      return store.size;
    },
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
    key(index) {
      return Array.from(store.keys())[index] || null;
    }
  };
}

const storage = createStorage({
  scholarmate_user: JSON.stringify({
    isLoggedIn: true,
    purchasedLicenses: ['CN115062165A', '63943642'],
    licensePurchasedAt: {
      CN115062165A: '2026-01-01T00:00:00.000Z',
      63943642: '2026-05-23T00:00:00.000Z'
    },
    digitalHumanSeats: [
      { inventorId: 'inv_001', patentId: 'CN115062165A', source: 'membership' },
      { inventorId: 'isjian', patentId: '63943642', source: 'membership' }
    ]
  }),
  scholarmate_chat_sessions_v2: JSON.stringify([
    { sessionId: 'old', inventorId: 'inv_001', patentId: 'CN115062165A', title: 'old demo', messages: [] },
    { sessionId: 'cityu', inventorId: 'isjian', patentId: '63943642', title: 'cityu demo', messages: [] }
  ]),
  chat_history_inv_001_general_CN115062165A: JSON.stringify([
    { role: 'user', content: 'old', inventorId: 'inv_001', patentId: 'CN115062165A' }
  ]),
  scholarmate_demand_projects: JSON.stringify([
    {
      id: 'project_old',
      matchedPatentId: 'CN115062165A',
      recommendations: [
        { patentId: 'CN115062165A', score: 88 },
        { patentId: '63943642', score: 77 }
      ]
    }
  ]),
  scholarmate_trade_intents: JSON.stringify([
    { id: 'trade_old', patentId: 'CN115062165A' },
    { id: 'trade_cityu', patentId: '63943642' }
  ])
});

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
    location: { pathname: '/index.html', hash: '', search: '', origin: 'https://scholarmate-demo.vercel.app' },
    addEventListener() {}
  },
  localStorage: storage,
  URL,
  URLSearchParams
};

vm.createContext(sandbox);
vm.runInContext(coreSource, sandbox);
vm.runInContext(`${mainSource}\nthis.ScholarMate = ScholarMate; this.patents = patents; this.inventors = inventors;`, sandbox);

assert.equal(typeof sandbox.ScholarMate.migrateClientStorageForCatalog, 'function');
sandbox.ScholarMate.migrateClientStorageForCatalog();

const migratedUser = JSON.parse(storage.getItem('scholarmate_user'));
assert.deepEqual(migratedUser.purchasedLicenses, ['63943642']);
assert.deepEqual(Object.keys(migratedUser.licensePurchasedAt), ['63943642']);
assert.deepEqual(migratedUser.digitalHumanSeats, [
  { inventorId: 'isjian', patentId: '63943642', source: 'membership' }
]);

const migratedSessions = JSON.parse(storage.getItem('scholarmate_chat_sessions_v2'));
assert.deepEqual(migratedSessions.map(session => session.sessionId), ['cityu']);
assert.equal(storage.getItem('chat_history_inv_001_general_CN115062165A'), null);

const migratedProjects = JSON.parse(storage.getItem('scholarmate_demand_projects'));
assert.equal(migratedProjects[0].matchedPatentId, '');
assert.deepEqual(migratedProjects[0].recommendations.map(item => item.patentId), ['63943642']);

const migratedIntents = JSON.parse(storage.getItem('scholarmate_trade_intents'));
assert.deepEqual(migratedIntents.map(item => item.id), ['trade_cityu']);
assert.ok(storage.getItem('scholarmate_catalog_version'));

console.log('client storage migration tests passed');
