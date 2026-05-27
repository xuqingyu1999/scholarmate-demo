import assert from 'node:assert';
import fs from 'node:fs';
import vm from 'node:vm';

const ragSource = fs.readFileSync(new URL('../scripts/advisor-rag.js', import.meta.url), 'utf8');
const coreSource = fs.readFileSync(new URL('../scripts/business-core.js', import.meta.url), 'utf8');
const sandbox = { console };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(ragSource, sandbox);
vm.runInContext(coreSource, sandbox);

const BusinessCore = sandbox.ScholarMateBusinessCore;
assert.ok(BusinessCore, 'business core should load');

const zhaoKnowledge = JSON.parse(fs.readFileSync(new URL('../assets/scholars/zhao_jianliang_leon/knowledge/index.json', import.meta.url), 'utf8'));
const playbook = JSON.parse(fs.readFileSync(new URL('../data/collaboration-playbook.json', import.meta.url), 'utf8'));

const inventor = {
  id: 'zhao_jianliang_leon',
  name: 'Jianliang Leon ZHAO',
  expertise: ['blockchain', 'digital finance', 'smart contract security'],
  knowledgeIndex: zhaoKnowledge,
  skills: [
    { id: 'paper_evidence_retriever', name: 'Paper Evidence Retriever', priority: 80 },
    { id: 'risk_guard', name: 'Risk Guard', priority: 100 }
  ],
  rules: {
    evidenceRules: [{ id: 'evidence_metadata_limit', priority: 90, text: 'metadata-only is not full text' }]
  }
};

const patent = {
  id: 'CN114117510B',
  title: 'Random private key storage method and device',
  field: 'blockchain trust infrastructure',
  industry: 'blockchain',
  summary: 'A random private key storage and invocation method for blockchain applications.',
  inventorId: 'zhao_jianliang_leon',
  sourceUrl: 'https://scholars.cityu.edu.hk/en/publications/random-private-key-storage-method-and-device/'
};

const advisorContext = BusinessCore.buildAdvisorContext({
  inventor,
  patent,
  knowledgePatents: [patent],
  collaborationPlaybook: playbook,
  question: '这个私钥专利的 blockchain research basis 是什么？如果企业只想先做 evaluation license 怎么说？'
});

assert.ok(advisorContext.advisorEvidenceContext, 'fallback advisor context should expose the shared RAG evidence context');
assert.ok(
  advisorContext.advisorEvidenceContext.evidencePackets.some(item => item.citationKey === 'PATENT:CN114117510B'),
  'shared RAG context should keep the current patent packet'
);
assert.ok(
  advisorContext.paperEvidence.some(item => item.sourceType === 'paper_pdf'),
  'business fallback should derive paper evidence from the shared RAG retriever'
);
assert.ok(
  advisorContext.advisorEvidenceContext.evidencePackets.some(item => item.sourceType === 'collab_playbook'),
  'business fallback should derive collaboration evidence from the shared RAG retriever'
);

console.log('business-core-rag tests passed');
