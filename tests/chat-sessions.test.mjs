import assert from 'node:assert';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../scripts/chat-sessions.js', import.meta.url), 'utf8');
const storage = new Map();
const sandbox = {
  console,
  Date,
  Math,
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
  crypto: {
    randomUUID() {
      return 'session-fixed-id';
    }
  }
};

vm.createContext(sandbox);
vm.runInContext(source, sandbox);

const ChatSessions = sandbox.ChatSessions;

const created = ChatSessions.createSession({
  inventorId: 'inv_001',
  patentId: 'p1',
  projectId: 'project_a',
  model: 'demo-model'
});

assert.strictEqual(created.sessionId, 'session-fixed-id');
assert.strictEqual(created.title, '新的技术顾问对话');
assert.strictEqual(created.messages.length, 0);

const withUserMessage = ChatSessions.addMessage(created.sessionId, {
  role: 'user',
  content: '请评估这项专利适不适合基层医院影像诊断效率提升'
});

assert.ok(withUserMessage.title.includes('请评估这项专利'));
assert.strictEqual(withUserMessage.messages.length, 1);
assert.strictEqual(ChatSessions.listByInventor('inv_001').length, 1);

storage.set('chat_history_inv_002_general_p2', JSON.stringify([
  {
    role: 'user',
    content: '旧对话',
    time: '2026-05-01T00:00:00.000Z',
    inventorId: 'inv_002',
    patentId: 'p2',
    projectId: ''
  }
]));

const migrated = ChatSessions.migrateLegacy();
assert.strictEqual(migrated, 1);
assert.ok(storage.has('chat_history_inv_002_general_p2'));
assert.strictEqual(ChatSessions.listByInventor('inv_002')[0].messages[0].content, '旧对话');

ChatSessions.clearSession(created.sessionId);
assert.strictEqual(ChatSessions.getSession(created.sessionId), null, 'clearSession should delete only the selected session');
assert.strictEqual(ChatSessions.listByInventor('inv_002').length, 1, 'clearSession should not delete unrelated sessions');

const migratedSession = ChatSessions.listByInventor('inv_002')[0];
ChatSessions.clearSession(migratedSession.sessionId);
assert.strictEqual(ChatSessions.listByInventor('inv_002').length, 0, 'clearSession should delete migrated legacy sessions');
assert.strictEqual(storage.has('chat_history_inv_002_general_p2'), false, 'clearSession should remove the legacy source key for deleted migrated sessions');
assert.strictEqual(ChatSessions.migrateLegacy(), 0, 'deleted migrated sessions should not reappear on the next migration');

console.log('chat-sessions tests passed');
