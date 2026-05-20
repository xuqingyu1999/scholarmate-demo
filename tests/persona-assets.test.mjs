import assert from 'node:assert';
import fs from 'node:fs';
import vm from 'node:vm';

const mainSource = fs.readFileSync(new URL('../scripts/main.js', import.meta.url), 'utf8');
const personasPath = new URL('../assets/scholars/personas.json', import.meta.url);

const sandbox = {
  console,
  document: {
    addEventListener() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    getElementById() { return null; },
    createElement() { return { appendChild() {}, remove() {}, classList: { add() {}, remove() {} } }; },
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
  sessionStorage: {
    getItem() { return null; },
    setItem() {},
    removeItem() {}
  },
  URLSearchParams
};

vm.createContext(sandbox);
vm.runInContext(`${mainSource}\nthis.inventors = inventors; this.patents = patents;`, sandbox);

const personas = JSON.parse(fs.readFileSync(personasPath, 'utf8'));
const inventorIds = new Set((sandbox.inventors || []).map(inventor => inventor.id));
const patentIds = new Set((sandbox.patents || []).map(patent => patent.id));

const researchStyleEnum = new Set(['theory', 'engineering', 'industry']);
const toneEnum = new Set(['严谨克制', '直接犀利', '温和耐心', '善用比喻', '产业务实']);
const verbosityEnum = new Set(['short', 'medium', 'long']);
const metaphorStyleEnum = new Set(['rare', 'occasional', 'frequent']);
const ENGLISH_INSTITUTION = /University|Institute of|Co Ltd|Corporation/i;

function assertString(value, message) {
  assert.ok(typeof value === 'string' && value.trim(), message);
}

function assertArrayRange(value, min, max, message) {
  assert.ok(Array.isArray(value), `${message} should be an array`);
  assert.ok(value.length >= min && value.length <= max, `${message} length should be ${min}-${max}`);
  value.forEach((entry, index) => assertString(entry, `${message}[${index}] should be non-empty string`));
}

assert.ok(personas && typeof personas === 'object', 'personas.json should be an object keyed by scholarId');
assert.ok(Object.keys(personas).length >= 10, 'personas.json should contain current scholar cards');
for (const inventorId of inventorIds) {
  assert.ok(personas[inventorId], `missing persona for ${inventorId}`);
}

for (const [scholarId, persona] of Object.entries(personas)) {
  assert.strictEqual(persona.scholarId, scholarId, `persona.scholarId should match key for ${scholarId}`);
  assertString(persona.name, `${scholarId} name required`);
  assertString(persona.title, `${scholarId} title required`);
  assert.ok(!ENGLISH_INSTITUTION.test(persona.title), `${scholarId} title should not include English institution names`);

  assert.ok(researchStyleEnum.has(persona.researchStyle), `${scholarId} researchStyle should be one of ${Array.from(researchStyleEnum).join(', ')}`);
  assert.ok(toneEnum.has(persona.tone), `${scholarId} tone should be one of ${Array.from(toneEnum).join(', ')}`);
  assert.ok(verbosityEnum.has(persona.verbosity), `${scholarId} verbosity should be one of ${Array.from(verbosityEnum).join(', ')}`);
  assert.ok(metaphorStyleEnum.has(persona.metaphorStyle), `${scholarId} metaphorStyle should be one of ${Array.from(metaphorStyleEnum).join(', ')}`);

  assertArrayRange(persona.coreTopics, 3, 5, `${scholarId} coreTopics`);
  assertArrayRange(persona.adjacentTopics, 3, 5, `${scholarId} adjacentTopics`);
  assertArrayRange(persona.outOfScope, 3, 5, `${scholarId} outOfScope`);
  assertArrayRange(persona.signaturePhrases, 2, 4, `${scholarId} signaturePhrases`);
  assertArrayRange(persona.avoidTopics, 2, 4, `${scholarId} avoidTopics`);
  assertArrayRange(persona.avoidPhrases, 3, 6, `${scholarId} avoidPhrases`);

  assert.ok(persona.rejectionTemplates && typeof persona.rejectionTemplates === 'object', `${scholarId} rejectionTemplates required`);
  assertString(persona.rejectionTemplates.outOfField, `${scholarId} rejectionTemplates.outOfField required`);
  assertString(persona.rejectionTemplates.inFieldButUntouched, `${scholarId} rejectionTemplates.inFieldButUntouched required`);
  assertString(persona.rejectionTemplates.beyondPublic, `${scholarId} rejectionTemplates.beyondPublic required`);

  if (persona.corePatentIds !== undefined) {
    assert.ok(Array.isArray(persona.corePatentIds) && persona.corePatentIds.length > 0, `${scholarId} corePatentIds should be non-empty array when present`);
    persona.corePatentIds.forEach((patentId, index) => {
      assertString(patentId, `${scholarId} corePatentIds[${index}] should be string`);
      assert.ok(patentIds.has(patentId), `${scholarId} corePatentIds[${index}] should map to existing catalog patent`);
    });
  }
}

assert.strictEqual(personas.inv_001.scholarId, 'inv_001');
assert.ok(personas.inv_001.corePatentIds.includes('CN115062165A'), 'inv_001 should map to known patent');
assert.ok(inventorIds.has(personas.inv_001.scholarId), 'inv_001 should map to existing inventor id');

console.log('persona assets tests passed');