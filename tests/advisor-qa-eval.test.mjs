import assert from 'node:assert';
import { fileURLToPath } from 'node:url';
import {
  loadEvalSet,
  validateEvalSet,
  scoreRetrieval,
  scoreAnswer,
  runDryEvaluation
} from '../scripts/evaluate-advisor-qa.mjs';

const evalSet = loadEvalSet(new URL('./fixtures/advisor-qa-eval-set.json', import.meta.url));
const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const validation = validateEvalSet(evalSet);
assert.deepStrictEqual(validation.errors, []);
assert.strictEqual(evalSet.length, 36, 'gold set should contain exactly 36 questions');

const categoryCounts = evalSet.reduce((acc, item) => {
  acc[item.category] = (acc[item.category] || 0) + 1;
  return acc;
}, {});
assert.strictEqual(categoryCounts.patent_fact, 12);
assert.strictEqual(categoryCounts.paper_research, 8);
assert.strictEqual(categoryCounts.enterprise_collaboration, 10);
assert.strictEqual(categoryCounts.boundary, 6);

assert.strictEqual(new Set(evalSet.map(item => item.inventorId)).size, 9, 'gold set should cover all 9 CityU scholars');
assert.strictEqual(new Set(evalSet.map(item => item.patentId)).size, 16, 'gold set should cover all 16 CityU patents');

for (const item of evalSet) {
  for (const field of [
    'id',
    'inventorId',
    'patentId',
    'question',
    'category',
    'expectedBehavior',
    'qrels',
    'requiredClaims',
    'forbiddenClaims',
    'acceptableBoundaryLanguage'
  ]) {
    assert.ok(field in item, `${item.id} missing ${field}`);
  }
}

const retrievalMetrics = scoreRetrieval({
  qrels: [
    { sourceId: 'PATENT:63943642', relevance: 3 },
    { sourceId: 'PAPER:chunk-a', relevance: 2 }
  ],
  evidencePackets: [
    { citationKey: 'PAPER:chunk-a', id: 'chunk-a', sourceType: 'paper_pdf' },
    { citationKey: 'PATENT:63943642', id: '63943642', sourceType: 'patent' }
  ],
  k: 5
});
assert.strictEqual(retrievalMetrics.recallAtK, 1);
assert.strictEqual(retrievalMetrics.mrrAtK, 1);
assert.ok(retrievalMetrics.ndcgAtK > 0.8);

const nonRelevantRetrievalMetrics = scoreRetrieval({
  qrels: [{ sourceId: 'PATENT:not-relevant', relevance: 0 }],
  evidencePackets: [{ citationKey: 'PATENT:not-relevant', id: 'not-relevant', sourceType: 'patent' }],
  k: 5
});
assert.strictEqual(nonRelevantRetrievalMetrics.recallAtK, 0);
assert.strictEqual(nonRelevantRetrievalMetrics.mrrAtK, 0);
assert.strictEqual(nonRelevantRetrievalMetrics.contextNoise, 1);

const answerMetrics = scoreAnswer({
  testCase: {
    requiredClaims: ['metadata-only', 'not CityU official'],
    forbiddenClaims: ['guaranteed royalty'],
    acceptableBoundaryLanguage: ['cannot provide official terms'],
    expectedBehavior: 'boundary'
  },
  answer: 'This is metadata-only background and not CityU official. I cannot provide official terms. [PLAYBOOK:license-option-evaluation]',
  evidencePackets: [{ citationKey: 'PLAYBOOK:license-option-evaluation' }]
});
assert.strictEqual(answerMetrics.requiredClaimRecall, 1);
assert.strictEqual(answerMetrics.forbiddenClaimCount, 0);
assert.strictEqual(answerMetrics.citationPrecision, 1);
assert.strictEqual(answerMetrics.invalidCitationCount, 0);
assert.strictEqual(answerMetrics.boundaryAcceptable, true);

const markerCitationMetrics = scoreAnswer({
  testCase: {
    requiredClaims: [],
    forbiddenClaims: [],
    acceptableBoundaryLanguage: [],
    expectedBehavior: 'answer'
  },
  answer: '回答末尾使用中文依据标记。【依据】CN114117510B',
  evidencePackets: [{ citationKey: 'PATENT:CN114117510B' }]
});
assert.strictEqual(markerCitationMetrics.citationPrecision, 1);
assert.strictEqual(markerCitationMetrics.citationRecall, 1);

const punctuatedMarkerCitationMetrics = scoreAnswer({
  testCase: {
    requiredClaims: [],
    forbiddenClaims: [],
    acceptableBoundaryLanguage: [],
    expectedBehavior: 'answer'
  },
  answer: '回答末尾使用中文依据标记。【依据】CN114117510B.',
  evidencePackets: [{ citationKey: 'PATENT:CN114117510B' }]
});
assert.strictEqual(punctuatedMarkerCitationMetrics.citationPrecision, 1);
assert.strictEqual(punctuatedMarkerCitationMetrics.citationRecall, 1);

const bracketedMarkerCitationMetrics = scoreAnswer({
  testCase: {
    requiredClaims: [],
    forbiddenClaims: [],
    acceptableBoundaryLanguage: [],
    expectedBehavior: 'answer'
  },
  answer: '回答末尾使用中文依据标记。【依据】[PATENT:CN114117510B]',
  evidencePackets: [{ citationKey: 'PATENT:CN114117510B' }]
});
assert.strictEqual(bracketedMarkerCitationMetrics.citationPrecision, 1);
assert.strictEqual(bracketedMarkerCitationMetrics.invalidCitationCount, 0);

const missingCitationMetrics = scoreAnswer({
  testCase: {
    requiredClaims: [],
    forbiddenClaims: [],
    acceptableBoundaryLanguage: [],
    expectedBehavior: 'answer'
  },
  answer: '回答没有任何引用。',
  evidencePackets: [{ citationKey: 'PATENT:CN114117510B' }]
});
assert.strictEqual(missingCitationMetrics.citationPrecision, 0);
assert.strictEqual(missingCitationMetrics.citationRecall, 0);

const report = runDryEvaluation({
  evalSet,
  mode: 'mock',
  ragEnabled: true
});
assert.strictEqual(report.mode, 'mock');
assert.strictEqual(report.ragEnabled, true);
assert.strictEqual(report.caseCount, 36);
assert.strictEqual(report.answerMode, 'mock_expected_claims');
assert.ok(report.aggregate.retrieval.recallAt5 >= 0);
assert.ok('boundaryAcceptableRatio' in report.aggregate.boundary);

const retrieverReport = runDryEvaluation({
  evalSet,
  mode: 'retriever',
  ragEnabled: true,
  dataRoot: repoRoot
});
assert.strictEqual(retrieverReport.mode, 'retriever');
assert.strictEqual(retrieverReport.caseCount, 36);
assert.ok(
  retrieverReport.aggregate.retrieval.recallAt5 >= 0.75,
  `retriever Recall@5 should meet the first-pass threshold, got ${retrieverReport.aggregate.retrieval.recallAt5}`
);

const baselineReport = runDryEvaluation({
  evalSet,
  mode: 'retriever',
  ragEnabled: false,
  dataRoot: repoRoot
});
assert.strictEqual(baselineReport.ragEnabled, false);
assert.ok(
  baselineReport.aggregate.retrieval.recallAt5 <= retrieverReport.aggregate.retrieval.recallAt5,
  'baseline without RAG should not outperform the RAG retriever on the same qrels'
);

console.log('advisor QA eval tests passed');
