import assert from 'node:assert';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../scripts/main.js', import.meta.url), 'utf8');

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
    body: { appendChild() {}, insertBefore() {}, firstChild: null }
  },
  window: {
    location: { pathname: '/index.html', hash: '', search: '', origin: 'http://127.0.0.1:8123' },
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
vm.runInContext(`${source}\nthis.ScholarMate = ScholarMate;`, sandbox);

const cases = [
  ['/index.html', '', 'home'],
  ['/patent-list.html', '', 'discover'],
  ['/patent-detail.html', '', 'discover'],
  ['/user-center.html', '#demand-projects', 'demand'],
  ['/user-center.html', '#my-digital-assets', 'advisor'],
  ['/user-center.html', '#my-conversations', 'advisor'],
  ['/chat.html', '', 'advisor'],
  ['/membership.html', '', 'me'],
  ['/user-center.html', '#enterprise-verification', 'me'],
  ['/user-center.html', '#my-licenses', 'me']
];

for (const [pathname, hash, expected] of cases) {
  assert.strictEqual(
    sandbox.ScholarMate.getMobileBottomNavActive({ pathname, hash }),
    expected,
    `${pathname}${hash} should highlight ${expected}`
  );
}

assert.strictEqual(
  sandbox.ScholarMate.getMobileBottomNavHref('index.html', {
    pathname: '/patent-list.html',
    search: '?mobile=1',
    hash: '',
    origin: 'http://127.0.0.1:8123'
  }),
  'index.html?mobile=1',
  'mobile preview home nav should preserve mobile=1'
);

assert.strictEqual(
  sandbox.ScholarMate.getMobileBottomNavHref('patent-list.html', {
    pathname: '/index.html',
    search: '?mobile=1',
    hash: '',
    origin: 'http://127.0.0.1:8123'
  }),
  'patent-list.html?mobile=1',
  'mobile preview discover nav should preserve mobile=1'
);

assert.strictEqual(
  sandbox.ScholarMate.getMobileBottomNavHref('user-center.html#demand-projects', {
    pathname: '/patent-list.html',
    search: '?mobile=1',
    hash: '',
    origin: 'http://127.0.0.1:8123'
  }),
  'user-center.html?mobile=1#demand-projects',
  'mobile preview demand nav should preserve mobile=1 before hash'
);

assert.strictEqual(
  sandbox.ScholarMate.getMobileBottomNavHref('user-center.html#my-digital-assets', {
    pathname: '/patent-list.html',
    search: '',
    hash: '',
    origin: 'http://127.0.0.1:8123'
  }),
  'user-center.html#my-digital-assets',
  'real mobile nav should not add mobile=1'
);

console.log('mobile-nav tests passed');
