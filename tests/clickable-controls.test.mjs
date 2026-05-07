import assert from 'node:assert';
import fs from 'node:fs';

const files = fs.readdirSync(new URL('../', import.meta.url))
  .filter(file => file.endsWith('.html'));

function getAttr(tag, name) {
  const match = tag.match(new RegExp(`${name}\\s*=\\s*("[^"]*"|'[^']*'|[^\\s>]+)`, 'i'));
  return match ? match[1].replace(/^['"]|['"]$/g, '') : '';
}

const idBoundButtons = new Set([
  'createDemandRecommendationBtn',
  'clearDemandTextBtn'
]);

const classBoundButtons = [
  'patent-list-filter__option',
  'tab',
  'user-menu__item',
  'patent-card__favorite',
  'menu-toggle'
];

const missingActions = [];

for (const file of files) {
  const html = fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
  const tags = html.match(/<(button|a)\b[^>]*>/gi) || [];

  for (const tag of tags) {
    const kind = tag.match(/^<(button|a)/i)[1].toLowerCase();
    const href = getAttr(tag, 'href');
    const onclick = getAttr(tag, 'onclick');
    const type = getAttr(tag, 'type');
    const id = getAttr(tag, 'id');
    const className = getAttr(tag, 'class');
    const disabled = /\bdisabled\b/i.test(tag);
    const hasEventBoundClass = classBoundButtons.some(item => className.includes(item));
    const delegatesToClickableCard = tag.includes('btn btn--outline btn--sm') && html.includes('onclick="continueChat(');
    const hasAction = kind === 'button'
      ? disabled || onclick || type === 'submit' || idBoundButtons.has(id) || hasEventBoundClass || delegatesToClickableCard
      : href && href !== '#' && href !== 'javascript:void(0)';

    if (!hasAction) {
      missingActions.push({ file, tag });
    }
  }
}

assert.deepStrictEqual(missingActions, []);

console.log('clickable controls tests passed');
