import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  EVAL_VARIANTS,
  buildVariantRunPlan,
  rebuildReportFromRows,
  runLiveEvaluation,
  summarizeVariantDeltas
} from '../scripts/run-live-advisor-eval.mjs';

const fixturePath = new URL('./fixtures/advisor-qa-eval-set.json', import.meta.url);
const evalSet = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
const dataRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

assert.deepStrictEqual(
  EVAL_VARIANTS.map(item => item.id),
  ['current_rag_boundary', 'old_prompt_boundary', 'no_rag_boundary', 'rag_no_boundary']
);

const runPlan = buildVariantRunPlan({
  evalSet,
  dataRoot
});
assert.strictEqual(runPlan.length, 144, '36 questions x 4 variants should produce 144 planned calls');

const firstCurrent = runPlan.find(item => item.variantId === 'current_rag_boundary');
assert.deepStrictEqual(
  Object.keys(firstCurrent.productionPayload).sort(),
  ['inventorId', 'patentId', 'question'].sort(),
  'production current variant must keep the public /api/chat payload minimal'
);
assert.ok(!firstCurrent.messages, 'production current variant should not use local debug messages');

const localCurrentPlan = buildVariantRunPlan({
  evalSet,
  dataRoot,
  currentMode: 'local'
});
assert.strictEqual(localCurrentPlan.length, 144);
const firstLocalCurrent = localCurrentPlan.find(item => item.variantId === 'current_rag_boundary');
assert.ok(firstLocalCurrent.messages, 'local current mode should use eval-only direct LLM messages');
assert.ok(!firstLocalCurrent.productionPayload, 'local current mode must not pretend to call production /api/chat');
assert.ok(firstLocalCurrent.messages[0].content.includes('Retrieved Evidence Packets'));

{
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scholarmate-live-eval-boundary-'));
  const report = await runLiveEvaluation({
    evalSet: [{
      id: 'boundary-live-fail',
      inventorId: 'isjian',
      patentId: '63943642',
      question: 'Can you promise official royalty terms?',
      category: 'boundary',
      expectedBehavior: 'boundary',
      qrels: [{ sourceId: 'PATENT:63943642', relevance: 3 }],
      requiredClaims: [],
      forbiddenClaims: [],
      acceptableBoundaryLanguage: ['cannot provide official terms']
    }, {
      id: 'normal-live-pass',
      inventorId: 'isjian',
      patentId: '63943642',
      question: 'What is this patent about?',
      category: 'patent_fact',
      expectedBehavior: 'answer',
      qrels: [{ sourceId: 'PATENT:63943642', relevance: 3 }],
      requiredClaims: [],
      forbiddenClaims: [],
      acceptableBoundaryLanguage: ['cannot provide official terms']
    }],
    dataRoot,
    outDir,
    endpoint: 'https://example.test/api/chat',
    currentMode: 'local',
    model: 'gpt-live-test',
    transport: async request => ({
      ok: true,
      reply: request.testCase.expectedBehavior === 'boundary'
        ? 'No boundary phrase here. [PATENT:63943642]'
        : 'Regular answer. [PATENT:63943642]',
      model: 'gpt-live-test',
      provider: 'openai-compatible'
    })
  });
  assert.strictEqual(report.aggregate.current_rag_boundary.boundary.boundaryAcceptableRatio, 0);
  assert.strictEqual(report.comparisons.current_vs_no_rag_boundary.boundary.boundaryAcceptableRatio, 0);
  assert.strictEqual(report.aggregate.current_rag_boundary.boundary.overRefusalRate, 0);
}

const oldVariant = runPlan.find(item => item.variantId === 'old_prompt_boundary');
assert.ok(oldVariant.messages[0].content.includes('Legacy patent-only advisor context'));
assert.ok(!oldVariant.messages[0].content.includes('Retrieved Evidence Packets'));

const noRagVariant = runPlan.find(item => item.variantId === 'no_rag_boundary');
assert.ok(noRagVariant.messages[0].content.includes('Professor-style answer contract'));
assert.ok(noRagVariant.messages[0].content.includes('PATENT:'));
assert.ok(!noRagVariant.messages[0].content.includes('paper_pdf'));
assert.ok(!noRagVariant.messages[0].content.includes('collab_playbook'));

const noBoundaryVariant = runPlan.find(item => item.variantId === 'rag_no_boundary');
assert.ok(noBoundaryVariant.messages[0].content.includes('Retrieved Evidence Packets'));
assert.ok(!noBoundaryVariant.messages[0].content.includes('Out-of-boundary handling'));
assert.ok(!noBoundaryVariant.messages[0].content.includes('not CityU official'));

{
  const rebuilt = rebuildReportFromRows({
    rows: [{
      variantId: 'current_rag_boundary',
      retrieval: { recallAtK: 1, mrrAtK: 1, ndcgAtK: 1, contextRelevance: 1, contextNoise: 0 },
      answerMetrics: { requiredClaimRecall: 1, forbiddenClaimCount: 0, sectionCompliance: 1, citationRecall: 1, citationPrecision: 1, invalidCitationCount: 0, boundaryRequired: true, boundaryHit: false, boundaryAcceptable: false, overRefusal: false }
    }, {
      variantId: 'current_rag_boundary',
      retrieval: { recallAtK: 1, mrrAtK: 1, ndcgAtK: 1, contextRelevance: 1, contextNoise: 0 },
      answerMetrics: { requiredClaimRecall: 1, forbiddenClaimCount: 0, sectionCompliance: 1, citationRecall: 1, citationPrecision: 1, invalidCitationCount: 0, boundaryRequired: false, boundaryHit: false, boundaryAcceptable: true, overRefusal: false }
    }]
  });
  assert.strictEqual(rebuilt.aggregate.current_rag_boundary.boundary.boundaryAcceptableRatio, 0);
}

{
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scholarmate-live-eval-'));
  const calls = [];
  const report = await runLiveEvaluation({
    evalSet,
    dataRoot,
    outDir,
    endpoint: 'https://example.test/api/chat',
    model: 'gpt-live-test',
    transport: async request => {
      calls.push(request);
      return {
        ok: true,
        reply: `**核心判断**\n${request.testCase.requiredClaims.join(' ')}\n\n**依据**\n[${request.evidencePackets[0]?.citationKey || `PATENT:${request.testCase.patentId}`}]\n\n**适用条件**\nmock\n\n**风险边界**\n${request.testCase.acceptableBoundaryLanguage[0] || 'generic boundary'}\n\n**下一步建议**\nmock`,
        model: 'gpt-live-test',
        provider: request.variantId === 'current_rag_boundary' ? 'vercel' : 'openai-compatible'
      };
    },
    productionEvidenceResolver: async request => {
      if (request.variantId !== 'current_rag_boundary') return request.evidencePackets;
      return [{
        citationKey: 'PATENT:REMOTE-CURRENT',
        id: 'REMOTE-CURRENT',
        sourceType: 'patent',
        title: 'Remote current evidence',
        sourceUrl: 'https://example.test/remote',
        snippet: 'Remote evidence from deployed static assets.',
        metadataOnly: false
      }];
    }
  });
  assert.strictEqual(calls.length, 144);
  assert.strictEqual(report.caseCount, 36);
  assert.strictEqual(report.callCount, 144);
  assert.ok(report.outputs.jsonPath.endsWith('.json'));
  assert.ok(report.outputs.markdownPath.endsWith('.md'));
  assert.ok(fs.existsSync(report.outputs.jsonPath));
  assert.ok(fs.existsSync(report.outputs.markdownPath));
  const markdown = fs.readFileSync(report.outputs.markdownPath, 'utf8');
  assert.ok(markdown.includes('automatic metrics are semi-automatic'));
  assert.ok(markdown.includes('Context Relevance'));
  assert.ok(markdown.includes('Required Claim Recall'));
  assert.ok(markdown.includes('Citation Recall'));
  assert.ok(markdown.includes('Boundary Precision'));
  assert.ok(markdown.includes('Over-Refusal Rate'));
  assert.ok(markdown.includes('Current mode: production'));
  assert.ok(report.aggregate.current_rag_boundary);
  assert.ok(report.comparisons.current_vs_no_rag_boundary);
  const currentRow = report.rows.find(row => row.variantId === 'current_rag_boundary');
  assert.ok(currentRow.retrieved.includes('PATENT:REMOTE-CURRENT'));
  assert.strictEqual(currentRow.evidenceSource, 'production_static_assets');
}

{
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scholarmate-live-eval-local-current-'));
  const calls = [];
  const report = await runLiveEvaluation({
    evalSet,
    dataRoot,
    outDir,
    endpoint: 'https://example.test/api/chat',
    currentMode: 'local',
    model: 'gpt-live-test',
    transport: async request => {
      calls.push(request);
      assert.ok(request.messages, 'all variants should be direct LLM calls in local current mode');
      assert.ok(!request.productionPayload);
      return {
        ok: true,
        reply: `**核心判断**\n${request.testCase.requiredClaims.join(' ')}\n\n**依据**\n[${request.evidencePackets[0]?.citationKey || `PATENT:${request.testCase.patentId}`}]\n\n**适用条件**\nmock\n\n**风险边界**\n${request.testCase.acceptableBoundaryLanguage[0] || 'generic boundary'}\n\n**下一步建议**\nmock`,
        model: 'gpt-live-test',
        provider: 'openai-compatible'
      };
    }
  });
  assert.strictEqual(calls.length, 144);
  assert.strictEqual(report.currentMode, 'local');
  assert.strictEqual(report.evidenceProvenance.current_rag_boundary, 'local eval prompt context');
  assert.ok(fs.readFileSync(report.outputs.markdownPath, 'utf8').includes('Current mode: local'));
}

{
  const deltas = summarizeVariantDeltas({
    current_rag_boundary: { retrieval: { recallAt5: 1 }, answers: { forbiddenClaimCount: 0 } },
    no_rag_boundary: { retrieval: { recallAt5: 0.5 }, answers: { forbiddenClaimCount: 2 } }
  }, 'current_rag_boundary');
  assert.strictEqual(deltas.current_vs_no_rag_boundary.retrieval.recallAt5, 0.5);
  assert.strictEqual(deltas.current_vs_no_rag_boundary.answers.forbiddenClaimCount, -2);
}

{
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scholarmate-live-eval-fail-'));
  let failed = false;
  try {
    await runLiveEvaluation({
      evalSet,
      dataRoot,
      outDir,
      endpoint: 'https://example.test/api/chat',
      model: 'gpt-live-test',
      transport: async request => {
        if (request.variantId === 'current_rag_boundary') {
          return { ok: false, status: 401, error: 'Unauthorized: set LIVE_CHAT_TOKEN' };
        }
        return { ok: true, reply: 'should not continue', model: 'gpt-live-test' };
      }
    });
  } catch (error) {
    const message = String(error && error.message || error);
    failed = /current_rag_boundary/i.test(message) && /LIVE_CHAT_TOKEN/i.test(message);
  }
  assert.strictEqual(failed, true, 'current production failure should abort the live report');
  assert.deepStrictEqual(fs.readdirSync(outDir), [], 'failed live current call should not write report files');
}

console.log('live advisor eval tests passed');
