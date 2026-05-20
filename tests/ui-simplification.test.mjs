import assert from 'node:assert/strict';
import fs from 'node:fs';

const chatHtml = fs.readFileSync(new URL('../chat.html', import.meta.url), 'utf8');
const patentListHtml = fs.readFileSync(new URL('../patent-list.html', import.meta.url), 'utf8');

const removedPatentListSelectors = [
  'demand-upload-card',
  'demandTextFile',
  'demandTextInput',
  'demandUploadPreview',
  'createDemandRecommendationBtn',
  'clearDemandTextBtn'
];

for (const selector of removedPatentListSelectors) {
  assert.equal(
    patentListHtml.includes(selector),
    false,
    `patent-list.html should not expose demand upload UI: ${selector}`
  );
}

const removedChatChrome = [
  'chat-token-info',
  'chatMembershipCta',
  'seatActionPanel',
  '提交交易意向',
  'submitTradeIntentFromChat()'
];

for (const marker of removedChatChrome) {
  assert.equal(
    chatHtml.includes(marker),
    false,
    `chat.html should remove commercial/noisy chat chrome: ${marker}`
  );
}

for (const marker of ['chat-sources-panel', 'chat-boundary-panel', 'chat-right-panel']) {
  assert.equal(
    chatHtml.includes(marker),
    true,
    `chat.html should include NotebookLM-style trust panel: ${marker}`
  );
}

assert.match(chatHtml, /renderEvidenceCard/, 'chat evidence rendering should remain available');
assert.match(chatHtml, /sendLocalFallbackForLastQuestion/, 'local demo fallback should remain available');
assert.match(chatHtml, /sendQuickQuestion/, 'quick questions should remain available');

console.log('ui simplification tests passed');
