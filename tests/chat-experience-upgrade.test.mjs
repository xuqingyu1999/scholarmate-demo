import assert from 'node:assert';
import fs from 'node:fs';
import vm from 'node:vm';

const mainSource = fs.readFileSync(new URL('../scripts/main.js', import.meta.url), 'utf8');
const businessSource = fs.readFileSync(new URL('../scripts/business-core.js', import.meta.url), 'utf8');
const chatHtml = fs.readFileSync(new URL('../chat.html', import.meta.url), 'utf8');
const styles = fs.readFileSync(new URL('../styles/main.css', import.meta.url), 'utf8');
const membershipHtml = fs.readFileSync(new URL('../membership.html', import.meta.url), 'utf8');
const normalizedStyles = styles.replace(/\r\n/g, '\n');

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function cssRule(selector) {
  const pattern = new RegExp(`(?:^|\\n)${escapeRegExp(selector)}\\s*\\{([\\s\\S]*?)\\n\\}`, 'm');
  const match = normalizedStyles.match(pattern);
  assert.ok(match, `missing CSS rule for ${selector}`);
  return match[1];
}

const mainSandbox = {
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
    location: { pathname: '/index.html', hash: '', search: '' },
    addEventListener() {}
  },
  localStorage: {
    getItem() { return null; },
    setItem() {},
    removeItem() {}
  },
  URLSearchParams
};

vm.createContext(mainSandbox);
vm.runInContext(`${mainSource}\nthis.ScholarMate = ScholarMate;`, mainSandbox);

assert.strictEqual(typeof mainSandbox.ScholarMate.formatAssistantMessage, 'function');

const assistantHtml = mainSandbox.ScholarMate.formatAssistantMessage([
  '**核心判断**',
  '',
  '- 第一条',
  '- 第二条',
  '',
  '1. 下一步',
  '2. 风险',
  '',
  '<script>alert(1)</script>'
].join('\n'));

assert.ok(assistantHtml.includes('<strong>核心判断</strong>'), 'assistant replies should render bold markdown');
assert.ok(assistantHtml.includes('<ul>') && assistantHtml.includes('<li>第一条</li>'), 'assistant replies should render bullet lists');
assert.ok(assistantHtml.includes('<ol>') && assistantHtml.includes('<li>下一步</li>'), 'assistant replies should render numbered lists');
assert.ok(assistantHtml.includes('&lt;script&gt;alert(1)&lt;/script&gt;'), 'assistant markdown renderer must escape HTML');

const userHtml = mainSandbox.ScholarMate.formatMessage('**不要加粗**\n<script>alert(1)</script>');
assert.ok(userHtml.includes('**不要加粗**'), 'user messages should remain plain text, not markdown');
assert.ok(userHtml.includes('&lt;script&gt;alert(1)&lt;/script&gt;'), 'user messages should remain escaped');

assert.ok(
  chatHtml.includes('isAI ? ScholarMate.formatAssistantMessage(visibleContent) : ScholarMate.formatMessage(visibleContent)'),
  'chat.html should use markdown rendering only for AI messages'
);
assert.ok(!chatHtml.includes('<aside class="chat-right-panel"'), 'chat page should no longer require a permanent right column');
assert.ok(chatHtml.includes('chat-context-panel'), 'chat page should keep source/boundary context as an in-chat panel');
assert.ok(styles.includes('grid-template-columns: 232px minmax(0, 1fr)'), 'desktop layout should use a narrow scholar rail and wide chat stage');
assert.ok(!styles.includes('grid-template-columns: 260px minmax(0, 1fr) 300px'), 'desktop layout should remove the old permanent three-column chat grid');
assert.ok(styles.includes('min-height: 72px'), 'composer should start larger than a single-line input');
assert.ok(styles.includes('max-height: 220px'), 'composer should expand up to about 220px');
assert.ok(chatHtml.includes('Math.min(textarea.scrollHeight, 220)'), 'auto resize should match the 220px composer cap');

const chatPageRule = cssRule('body.chat-page');
assert.ok(chatPageRule.includes('height: 100dvh'), 'chat page body should be locked to the dynamic viewport height');
assert.ok(chatPageRule.includes('overflow: hidden'), 'chat page body should not become the primary scroll container');

const chatPageMainRule = cssRule('body.chat-page main');
assert.ok(chatPageMainRule.includes('height: calc(100dvh -'), 'chat main should fill the viewport below the navbar');
assert.ok(chatPageMainRule.includes('overflow: hidden'), 'chat main should keep overflow inside the shell');

const shellContainerRule = cssRule('.chat-shell-container');
assert.ok(shellContainerRule.includes('height: 100%'), 'chat shell container should continue the fixed-height chain');
assert.ok(shellContainerRule.includes('min-height: 0'), 'chat shell container should allow nested scroll children to shrink');
assert.ok(chatHtml.includes('class="container chat-shell-container"'), 'chat.html should mark the chat container as the shell container');

const chatLayoutRule = cssRule('.chat-layout');
assert.ok(chatLayoutRule.includes('height: 100%'), 'chat layout should fill the shell container');
assert.ok(chatLayoutRule.includes('min-height: 0'), 'chat layout should allow the message pane to own scrolling');
assert.ok(chatLayoutRule.includes('overflow: hidden'), 'chat layout should prevent whole-page scroll growth');

const chatMainRule = cssRule('.chat-main');
assert.ok(chatMainRule.includes('height: 100%'), 'chat main should fill the layout height');
assert.ok(chatMainRule.includes('min-height: 0'), 'chat main should allow chat messages to shrink');
assert.ok(chatMainRule.includes('overflow: hidden'), 'chat main should keep header/context/input fixed in the shell');
assert.ok(
  normalizedStyles.includes('.chat-header,\n.chat-context-panel,\n.chat-input-area {\n    flex: 0 0 auto;'),
  'chat header, context panel, and input area should keep fixed shell slots'
);

const chatMessagesRule = cssRule('.chat-messages');
assert.ok(chatMessagesRule.includes('min-height: 0'), 'chat messages should be allowed to shrink inside the flex column');
assert.ok(chatMessagesRule.includes('overflow-y: auto'), 'chat messages should be the vertical scroll container');
assert.ok(chatMessagesRule.includes('scrollbar-gutter: stable'), 'chat messages should reserve space for the internal scrollbar');
assert.ok(chatMessagesRule.includes('scrollbar-width: thin'), 'chat messages should use a thin internal scrollbar');

const contextIndex = chatHtml.indexOf('class="chat-context-panel"');
const messagesIndex = chatHtml.indexOf('class="chat-messages"');
const inputIndex = chatHtml.indexOf('class="chat-input-area"');
assert.ok(contextIndex > -1 && messagesIndex > -1 && inputIndex > -1, 'chat shell regions should exist');
assert.ok(contextIndex < messagesIndex, 'context panel should sit above the message scroll area');
assert.ok(messagesIndex < inputIndex, 'input area should remain below the message scroll area inside chat-main');
assert.ok(!normalizedStyles.includes('body.chat-page .chat-input-area {\n        position: sticky;'), 'mobile chat input should not use a page-level sticky overlay');
assert.ok(!normalizedStyles.includes('body.mobile-preview-mode.chat-page .chat-input-area {\n    position: fixed;'), 'mobile preview chat input should not use a page-level fixed overlay');

const businessSandbox = { console };
vm.createContext(businessSandbox);
vm.runInContext(businessSource, businessSandbox);
const BusinessCore = businessSandbox.ScholarMateBusinessCore;

assert.strictEqual(BusinessCore.MEMBERSHIP_PLANS.free.dailyTokenLimit, 100);
assert.strictEqual(BusinessCore.MEMBERSHIP_PLANS.professional.dailyTokenLimit, 1000);
assert.strictEqual(BusinessCore.MEMBERSHIP_PLANS.enterprise.dailyTokenLimit, 5000);
assert.ok(membershipHtml.includes('每日 1000 Token'), 'membership page should show professional 1000 token daily quota');
assert.ok(membershipHtml.includes('每日 5000 Token'), 'membership page should show enterprise 5000 token daily quota');

const fallback = BusinessCore.composeAdvisorReply({
  inventorName: 'Jian MA',
  patent: {
    id: '63943642',
    title: 'Large language model patent recommendation method',
    field: 'patent recommendation',
    summary: 'Uses heterogeneous data and quality signals for patent recommendation.'
  },
  project: { title: 'AI patent screening', industry: 'technology transfer', stage: 'pilot', budget: '100万以上' },
  question: '这项技术适合我们吗？'
});

for (const heading of ['核心判断', '依据', '适用条件', '风险边界', '下一步建议']) {
  assert.ok(fallback.includes(heading), `local fallback should include professor-style heading: ${heading}`);
}

console.log('chat experience upgrade tests passed');
