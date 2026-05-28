import assert from 'node:assert';
import fs from 'node:fs';

const playbook = JSON.parse(fs.readFileSync(new URL('../data/collaboration-playbook.json', import.meta.url), 'utf8'));

assert.ok(playbook.length >= 10, 'playbook should keep broad collaboration coverage');

for (const entry of playbook) {
  assert.ok(Array.isArray(entry.sourceRationale), `${entry.id} should include sourceRationale`);
  assert.ok(entry.sourceRationale.length >= 1, `${entry.id} should include at least one rationale source`);
  assert.ok(
    entry.sourceRationale.some(item => item && item.region === 'mainland_china'),
    `${entry.id} should include a mainland China policy/practice source`
  );
  assert.ok(
    String(entry.boundaryNote || '').includes('not CityU') ||
      String(entry.cnBoundaryNote || '').includes('不是 CityU'),
    `${entry.id} should keep CityU official-term boundary visible`
  );
}

const sourceUrls = playbook
  .flatMap(entry => entry.sourceRationale || [])
  .map(item => item.url)
  .filter(Boolean);

assert.ok(
  sourceUrls.some(url => url.includes('gov.cn')),
  'mainland China sources should include central government policy sources'
);
assert.ok(
  sourceUrls.some(url => url.includes('pku.edu.cn') || url.includes('tsinghua.edu.cn') || url.includes('shu.edu.cn') || url.includes('sjtu.edu.cn')),
  'mainland China sources should include university technology-transfer practice sources'
);

console.log('mainland TTO playbook tests passed');
