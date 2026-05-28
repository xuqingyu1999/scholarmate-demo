import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import {
  loadEvalSet,
  scoreAnswer,
  scoreRetrieval,
  validateEvalSet
} from './evaluate-advisor-qa.mjs';

export const DEFAULT_LIVE_ENDPOINT = 'https://scholarmate-demo-git-main-xuqingyu1999s-projects.vercel.app/api/chat';

export const EVAL_VARIANTS = Object.freeze([
  { id: 'current_rag_boundary', label: 'Current production RAG + boundary' },
  { id: 'old_prompt_boundary', label: 'Legacy patent-only prompt + boundary' },
  { id: 'no_rag_boundary', label: 'Current boundary with patent-only RAG disabled' },
  { id: 'rag_no_boundary', label: 'RAG evidence without boundary guardrails' }
]);

function createStorageStub() {
  return {
    getItem() { return null; },
    setItem() {},
    removeItem() {},
    key() { return null; },
    get length() { return 0; }
  };
}

function loadUmdApi(filePath, globalName, extra = {}) {
  const source = fs.readFileSync(filePath, 'utf8');
  return loadUmdApiFromSource(source, globalName, extra);
}

function loadUmdApiFromSource(source, globalName, extra = {}) {
  const sandbox = Object.assign({ console }, extra);
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  if (!sandbox[globalName]) throw new Error(`${globalName} unavailable`);
  return sandbox[globalName];
}

function loadMainData(rootDir) {
  const source = fs.readFileSync(path.join(rootDir, 'scripts/main.js'), 'utf8');
  return loadMainDataFromSource(source);
}

function loadMainDataFromSource(source) {
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
    localStorage: createStorageStub(),
    sessionStorage: createStorageStub(),
    URLSearchParams
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(`${source}\nthis.__inventors = inventors; this.__patents = patents;`, sandbox);
  return {
    inventors: Array.isArray(sandbox.__inventors) ? sandbox.__inventors : [],
    patents: Array.isArray(sandbox.__patents) ? sandbox.__patents : []
  };
}

async function fetchTextOrThrow(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`failed to fetch ${url}: ${response.status}`);
  return response.text();
}

function assetUrl(origin, assetPath) {
  return new URL(String(assetPath || '').replace(/^\/+/, ''), origin.endsWith('/') ? origin : `${origin}/`).href;
}

async function loadRemoteJson(origin, assetPath, fallbackValue) {
  const response = await fetch(assetUrl(origin, assetPath));
  if (response.status === 404) return fallbackValue;
  if (!response.ok) throw new Error(`failed to fetch ${assetPath}: ${response.status}`);
  return response.json();
}

function endpointOrigin(endpoint) {
  try {
    return new URL(endpoint).origin;
  } catch (error) {
    throw new Error(`invalid live endpoint URL: ${endpoint}`);
  }
}

function loadJsonIfExists(filePath, fallbackValue) {
  try {
    if (!fs.existsSync(filePath)) return fallbackValue;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    return fallbackValue;
  }
}

function loadScholarAssets(rootDir, inventorId) {
  const safeId = String(inventorId || '').replace(/[^A-Za-z0-9_-]/g, '');
  const scholarRoot = path.join(rootDir, 'assets/scholars', safeId);
  return {
    knowledgeIndex: loadJsonIfExists(path.join(scholarRoot, 'knowledge/index.json'), {}),
    paperManifest: loadJsonIfExists(path.join(scholarRoot, 'papers/manifest.json'), {})
  };
}

function loadEvalApis(rootDir) {
  const AdvisorRag = loadUmdApi(path.join(rootDir, 'scripts/advisor-rag.js'), 'ScholarMateAdvisorRag');
  const LlmClient = loadUmdApi(path.join(rootDir, 'scripts/llm-client.js'), 'LlmClient', {
    ScholarMateAdvisorRag: AdvisorRag
  });
  const LegacyLlmClient = loadUmdApi(path.join(rootDir, 'scripts/llm-client.js'), 'LlmClient');
  return { AdvisorRag, LlmClient, LegacyLlmClient };
}

function createProductionEvidenceResolver({ endpoint }) {
  const origin = endpointOrigin(endpoint);
  const cache = {
    scholarAssets: new Map()
  };
  return async planItem => {
    if (!cache.AdvisorRag) {
      cache.AdvisorRag = loadUmdApiFromSource(
        await fetchTextOrThrow(assetUrl(origin, 'scripts/advisor-rag.js')),
        'ScholarMateAdvisorRag'
      );
    }
    if (!cache.data) {
      cache.data = loadMainDataFromSource(await fetchTextOrThrow(assetUrl(origin, 'scripts/main.js')));
    }
    if (!cache.playbook) {
      cache.playbook = await loadRemoteJson(origin, 'data/collaboration-playbook.json', []);
    }
    const testCase = planItem.testCase || {};
    const inventorId = String(testCase.inventorId || '');
    if (!cache.scholarAssets.has(inventorId)) {
      const safeId = inventorId.replace(/[^A-Za-z0-9_-]/g, '');
      cache.scholarAssets.set(inventorId, {
        knowledgeIndex: await loadRemoteJson(origin, `assets/scholars/${safeId}/knowledge/index.json`, {}),
        paperManifest: await loadRemoteJson(origin, `assets/scholars/${safeId}/papers/manifest.json`, {})
      });
    }
    const assets = cache.scholarAssets.get(inventorId) || {};
    const inventor = cache.data.inventors.find(item => item && item.id === inventorId) || {};
    const patent = cache.data.patents.find(item => item && item.id === testCase.patentId) || {};
    const knowledgePatents = cache.data.patents.filter(item => item && item.inventorId === inventorId);
    const context = cache.AdvisorRag.buildEvidenceContext({
      inventor,
      patent,
      knowledgePatents,
      knowledgeIndex: assets.knowledgeIndex || {},
      paperManifest: assets.paperManifest || {},
      collaborationPlaybook: cache.playbook || [],
      question: testCase.question,
      ragEnabled: true
    });
    const packets = Array.isArray(context.evidencePackets) ? context.evidencePackets : [];
    if (!packets.length) throw new Error(`production evidence unavailable for ${testCase.id}`);
    return packets;
  };
}

function getCaseContext(testCase, dataRoot, apis, dataCache) {
  const data = dataCache.data || (dataCache.data = loadMainData(dataRoot));
  const personas = dataCache.personas || (dataCache.personas = loadJsonIfExists(path.join(dataRoot, 'assets/scholars/personas.json'), {}));
  const playbook = dataCache.playbook || (dataCache.playbook = loadJsonIfExists(path.join(dataRoot, 'data/collaboration-playbook.json'), []));
  const inventor = data.inventors.find(item => item && item.id === testCase.inventorId) || {};
  const patent = data.patents.find(item => item && item.id === testCase.patentId) || {};
  const assets = loadScholarAssets(dataRoot, testCase.inventorId);
  const knowledgePatents = data.patents.filter(item => item && item.inventorId === testCase.inventorId);
  return {
    inventor,
    patent,
    persona: personas[testCase.inventorId] || null,
    knowledgePatents,
    knowledgeIndex: assets.knowledgeIndex,
    paperManifest: assets.paperManifest,
    collaborationPlaybook: playbook,
    question: testCase.question
  };
}

function stripBoundaryRules(prompt) {
  return String(prompt || '')
    .split('\n')
    .filter(line => !/boundary|refusal|out-of-boundary|not CityU official|metadata-only packets|cannot be treated|legal advice|official policy|official terms|non-overridable/i.test(line))
    .join('\n');
}

function stripNonPatentRagPacketRules(prompt) {
  return String(prompt || '')
    .split('\n')
    .filter(line => !/paper_(?:pdf|metadata)|collab_playbook/i.test(line))
    .join('\n');
}

function buildOldPromptMessages(context, apis) {
  const systemPrompt = [
    'Legacy patent-only advisor context.',
    apis.LegacyLlmClient.composeSystemPrompt({
      inventor: context.inventor,
      patent: context.patent,
      persona: context.persona,
      knowledgePatents: context.knowledgePatents,
      question: context.question
    })
  ].join('\n\n');
  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: context.question }
  ];
}

function buildMessagesForVariant(variantId, context, apis) {
  if (variantId === 'old_prompt_boundary') return buildOldPromptMessages(context, apis);
  const baseOptions = {
    inventor: context.inventor,
    patent: context.patent,
    persona: context.persona,
    knowledgePatents: context.knowledgePatents,
    knowledgeIndex: context.knowledgeIndex,
    paperManifest: context.paperManifest,
    collaborationPlaybook: context.collaborationPlaybook,
    question: context.question,
    ragEnabled: variantId !== 'no_rag_boundary'
  };
  const messages = apis.LlmClient.buildAdvisorMessages(baseOptions);
  if (variantId === 'no_rag_boundary') {
    return messages.map(message => message.role === 'system'
      ? { role: message.role, content: stripNonPatentRagPacketRules(message.content) }
      : message);
  }
  if (variantId === 'rag_no_boundary') {
    return messages.map(message => message.role === 'system'
      ? { role: message.role, content: stripBoundaryRules(message.content) }
      : message);
  }
  return messages;
}

function buildEvidenceForVariant(variantId, context, apis) {
  const ragEnabled = variantId !== 'old_prompt_boundary' && variantId !== 'no_rag_boundary';
  return apis.AdvisorRag.buildEvidenceContext({
    inventor: context.inventor,
    patent: context.patent,
    knowledgePatents: context.knowledgePatents,
    knowledgeIndex: context.knowledgeIndex,
    paperManifest: context.paperManifest,
    collaborationPlaybook: context.collaborationPlaybook,
    question: context.question,
    ragEnabled
  }).evidencePackets || [];
}

export function buildVariantRunPlan({ evalSet = [], dataRoot = process.cwd(), currentMode = 'production' } = {}) {
  const rootDir = path.resolve(String(dataRoot || process.cwd()));
  const apis = loadEvalApis(rootDir);
  const dataCache = {};
  const useProductionCurrent = currentMode !== 'local';
  const plan = [];
  for (const variant of EVAL_VARIANTS) {
    for (const testCase of evalSet) {
      const context = getCaseContext(testCase, rootDir, apis, dataCache);
      const evidencePackets = buildEvidenceForVariant(variant.id, context, apis);
      if (variant.id === 'current_rag_boundary' && useProductionCurrent) {
        plan.push({
          variantId: variant.id,
          testCase,
          evidencePackets,
          productionPayload: {
            inventorId: testCase.inventorId,
            patentId: testCase.patentId,
            question: testCase.question
          }
        });
      } else {
        plan.push({
          variantId: variant.id,
          testCase,
          evidencePackets,
          messages: buildMessagesForVariant(variant.id, context, apis)
        });
      }
    }
  }
  return plan;
}

function avg(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + Number(value || 0), 0) / values.length;
}

function aggregateResults(rows) {
  return {
    retrieval: {
      recallAt5: avg(rows.map(row => row.retrieval.recallAtK)),
      mrrAt5: avg(rows.map(row => row.retrieval.mrrAtK)),
      ndcgAt5: avg(rows.map(row => row.retrieval.ndcgAtK))
    },
    context: {
      relevanceRatio: avg(rows.map(row => row.retrieval.contextRelevance)),
      noiseRatio: avg(rows.map(row => row.retrieval.contextNoise))
    },
    answers: {
      requiredClaimRecall: avg(rows.map(row => row.answerMetrics.requiredClaimRecall)),
      forbiddenClaimCount: avg(rows.map(row => row.answerMetrics.forbiddenClaimCount)),
      sectionCompliance: avg(rows.map(row => row.answerMetrics.sectionCompliance)),
      citationRecall: avg(rows.map(row => row.answerMetrics.citationRecall)),
      citationPrecision: avg(rows.map(row => row.answerMetrics.citationPrecision)),
      invalidCitationCount: avg(rows.map(row => row.answerMetrics.invalidCitationCount))
    },
    boundary: (() => {
      const boundaryRows = rows.filter(row => row.answerMetrics.boundaryRequired);
      const tp = boundaryRows.filter(row => row.answerMetrics.boundaryHit).length;
      const precisionDenominator = rows.filter(row => row.answerMetrics.boundaryHit).length;
      const nonBoundaryRows = rows.filter(row => !row.answerMetrics.boundaryRequired);
      return {
        boundaryPrecision: precisionDenominator ? tp / precisionDenominator : 0,
        boundaryRecall: boundaryRows.length ? tp / boundaryRows.length : 0,
        overRefusalRate: avg(nonBoundaryRows.map(row => row.answerMetrics.overRefusal ? 1 : 0)),
        boundaryAcceptableRatio: boundaryRows.length ? tp / boundaryRows.length : 1
      };
    })()
  };
}

function diffObjects(current, other) {
  const diff = {};
  for (const [groupKey, groupValue] of Object.entries(current || {})) {
    if (!groupValue || typeof groupValue !== 'object') continue;
    diff[groupKey] = {};
    for (const [metricKey, metricValue] of Object.entries(groupValue)) {
      diff[groupKey][metricKey] = Number(metricValue || 0) - Number(other && other[groupKey] && other[groupKey][metricKey] || 0);
    }
  }
  return diff;
}

export function summarizeVariantDeltas(aggregate, baselineVariantId = 'current_rag_boundary') {
  const current = aggregate[baselineVariantId] || {};
  const comparisons = {};
  for (const variant of EVAL_VARIANTS) {
    if (variant.id === baselineVariantId) continue;
    comparisons[`current_vs_${variant.id}`] = diffObjects(current, aggregate[variant.id] || {});
  }
  return comparisons;
}

function defaultTransportFactory({ endpoint, chatToken, openAIKey, openAIBaseURL, model }) {
  return async request => {
    if (request.productionPayload) {
      const headers = { 'Content-Type': 'application/json' };
      if (chatToken) headers['x-scholar-mate-chat-token'] = chatToken;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(request.productionPayload)
      });
      let payload = null;
      try {
        payload = await response.json();
      } catch (error) {
        payload = null;
      }
      if (!response.ok) {
        const tokenHint = response.status === 401
          ? 'Unauthorized: production /api/chat appears to require CHAT_API_TOKEN; set LIVE_CHAT_TOKEN to the matching value and rerun.'
          : '';
        const serviceHint = [502, 503].includes(response.status)
          ? 'Production /api/chat is unavailable; stop and rerun when the deployment is healthy.'
          : '';
        return { ok: false, status: response.status, error: tokenHint || serviceHint || sanitizeErrorMessage((payload && payload.error) || response.statusText) };
      }
      return {
        ok: true,
        reply: payload && payload.reply || '',
        model: payload && payload.model || '',
        provider: payload && payload.provider || 'vercel'
      };
    }

    const activeModel = request.model || model;
    if (!openAIKey) throw new Error('OPENAI_API_KEY is required for local ablation variants');
    if (!activeModel) throw new Error('LIVE_EVAL_MODEL or deployed current model is required for local ablation variants');
    const response = await fetch(`${String(openAIBaseURL || 'https://api.openai.com/v1').replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${openAIKey}`
      },
      body: JSON.stringify({
        model: activeModel,
        messages: request.messages,
        temperature: 0.2,
        stream: false
      })
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      return { ok: false, status: response.status, error: sanitizeErrorMessage(payload && payload.error && payload.error.message || response.statusText) };
    }
    return {
      ok: true,
      reply: payload && payload.choices && payload.choices[0] && payload.choices[0].message && payload.choices[0].message.content || '',
      model: activeModel,
      provider: 'openai-compatible'
    };
  };
}

function sanitizeErrorMessage(message) {
  return String(message || 'upstream request failed')
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/g, 'Bearer [redacted]')
    .replace(/sk-[A-Za-z0-9_-]{12,}/g, 'sk-[redacted]')
    .replace(/[A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{12,}/g, '[redacted-token]');
}

function scoreRow(planItem, response, evidenceSource = 'local_eval_context') {
  const retrieval = scoreRetrieval({
    qrels: planItem.testCase.qrels,
    evidencePackets: planItem.evidencePackets,
    k: 5
  });
  const answerMetrics = scoreAnswer({
    testCase: planItem.testCase,
    answer: response.reply || '',
    evidencePackets: planItem.evidencePackets
  });
  return {
    id: planItem.testCase.id,
    category: planItem.testCase.category,
    inventorId: planItem.testCase.inventorId,
    patentId: planItem.testCase.patentId,
    variantId: planItem.variantId,
    evidenceSource,
    retrieved: planItem.evidencePackets.map(packet => packet.citationKey).filter(Boolean),
    retrieval,
    answerMetrics,
    response: {
      ok: !!response.ok,
      model: response.model || '',
      provider: response.provider || '',
      reply: response.reply || '',
      error: response.error || '',
      status: response.status || 0
    }
  };
}

function renderMetric(value) {
  return Number(value || 0).toFixed(3);
}

const MARKDOWN_METRIC_COLUMNS = Object.freeze([
  ['Retrieval Recall@5', metrics => metrics.retrieval && metrics.retrieval.recallAt5],
  ['Retrieval MRR@5', metrics => metrics.retrieval && metrics.retrieval.mrrAt5],
  ['Retrieval nDCG@5', metrics => metrics.retrieval && metrics.retrieval.ndcgAt5],
  ['Context Relevance', metrics => metrics.context && metrics.context.relevanceRatio],
  ['Context Noise', metrics => metrics.context && metrics.context.noiseRatio],
  ['Required Claim Recall', metrics => metrics.answers && metrics.answers.requiredClaimRecall],
  ['Forbidden Claim Count', metrics => metrics.answers && metrics.answers.forbiddenClaimCount],
  ['Section Compliance', metrics => metrics.answers && metrics.answers.sectionCompliance],
  ['Citation Recall', metrics => metrics.answers && metrics.answers.citationRecall],
  ['Citation Precision', metrics => metrics.answers && metrics.answers.citationPrecision],
  ['Invalid Citation Count', metrics => metrics.answers && metrics.answers.invalidCitationCount],
  ['Boundary Acceptable', metrics => metrics.boundary && metrics.boundary.boundaryAcceptableRatio],
  ['Boundary Precision', metrics => metrics.boundary && metrics.boundary.boundaryPrecision],
  ['Boundary Recall', metrics => metrics.boundary && metrics.boundary.boundaryRecall],
  ['Over-Refusal Rate', metrics => metrics.boundary && metrics.boundary.overRefusalRate]
]);

function renderMetricTableHeader(firstColumn) {
  return [
    `| ${firstColumn} | ${MARKDOWN_METRIC_COLUMNS.map(([label]) => label).join(' | ')} |`,
    `|---|${MARKDOWN_METRIC_COLUMNS.map(() => '---:').join('|')}|`
  ];
}

function renderMetricRow(label, metrics) {
  return `| ${label} | ${MARKDOWN_METRIC_COLUMNS.map(([, read]) => renderMetric(read(metrics || {}))).join(' | ')} |`;
}

function renderMarkdownReport(report) {
  const lines = [
    '# ScholarMate Live LLM Evaluation',
    '',
    '> These automatic metrics are semi-automatic gold-set checks. They are not a substitute for the planned 20% human claim-level review.',
    '',
    `Generated: ${report.generatedAt}`,
    `Cases: ${report.caseCount}`,
    `Calls: ${report.callCount}`,
    `Current mode: ${report.currentMode || 'production'}`,
    `Current evidence source: ${report.evidenceProvenance && report.evidenceProvenance.current_rag_boundary || 'unknown'}`,
    '',
    '## Aggregate Metrics',
    '',
    ...renderMetricTableHeader('Variant')
  ];
  for (const variant of EVAL_VARIANTS) {
    lines.push(renderMetricRow(variant.id, report.aggregate[variant.id] || {}));
  }
  lines.push('', '## Deltas Versus current_rag_boundary', '');
  lines.push(...renderMetricTableHeader('Comparison'));
  for (const [comparisonId, metrics] of Object.entries(report.comparisons || {})) {
    lines.push(renderMetricRow(comparisonId, metrics));
  }
  lines.push('', '## Failure Cases');
  const failures = report.rows
    .filter(row => row.response.error || row.answerMetrics.forbiddenClaimCount > 0 || row.answerMetrics.invalidCitationCount > 0)
    .slice(0, 10);
  if (!failures.length) lines.push('', 'No automatic failure cases in top 10 filters.');
  failures.forEach(row => {
    lines.push('', `- ${row.variantId} / ${row.id}: ${row.response.error || 'automatic metric issue'}`);
  });
  return `${lines.join('\n')}\n`;
}

export function rebuildReportFromRows(report) {
  const rows = Array.isArray(report && report.rows) ? report.rows : [];
  const aggregate = {};
  for (const variant of EVAL_VARIANTS) {
    aggregate[variant.id] = aggregateResults(rows.filter(row => row.variantId === variant.id));
  }
  const comparisons = summarizeVariantDeltas(aggregate, 'current_rag_boundary');
  return Object.assign({}, report, { aggregate, comparisons });
}

export async function runLiveEvaluation({
  evalSet = [],
  dataRoot = process.cwd(),
  outDir = path.join(process.cwd(), 'output/evals'),
  endpoint = DEFAULT_LIVE_ENDPOINT,
  currentMode = 'production',
  model = process.env.LIVE_EVAL_MODEL || process.env.OPENAI_MODEL || '',
  transport = null,
  productionEvidenceResolver = null,
  chatToken = process.env.LIVE_CHAT_TOKEN || process.env.CHAT_API_TOKEN || '',
  openAIKey = process.env.OPENAI_API_KEY || '',
  openAIBaseURL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'
} = {}) {
  const validation = validateEvalSet(evalSet);
  if (validation.errors.length) throw new Error(`invalid eval set: ${validation.errors.join('; ')}`);
  const plan = buildVariantRunPlan({ evalSet, dataRoot, currentMode });
  const rows = [];
  let resolvedModel = model;
  const send = transport || defaultTransportFactory({
    endpoint,
    chatToken,
    openAIKey,
    openAIBaseURL,
    model: resolvedModel
  });
  const resolveProductionEvidence = productionEvidenceResolver
    || (currentMode !== 'local' && !transport ? createProductionEvidenceResolver({ endpoint }) : null);

  for (const planItem of plan) {
    const response = await send(Object.assign({}, planItem, {
      endpoint,
      model: resolvedModel
    }));
    if (!response || !response.ok) {
      const detail = response && (response.error || response.status) || 'unknown error';
      throw new Error(`${planItem.variantId} failed for ${planItem.testCase.id}: ${detail}`);
    }
    if (planItem.variantId === 'current_rag_boundary' && !resolvedModel && response.model) {
      resolvedModel = response.model;
    }
    if (planItem.variantId !== 'current_rag_boundary' && !resolvedModel) {
      throw new Error('current_rag_boundary did not return a model; set LIVE_EVAL_MODEL');
    }
    let evidencePackets = planItem.evidencePackets;
    let evidenceSource = 'local_eval_context';
    if (planItem.variantId === 'current_rag_boundary' && resolveProductionEvidence) {
      evidencePackets = await resolveProductionEvidence(planItem);
      evidenceSource = 'production_static_assets';
    }
    rows.push(scoreRow(Object.assign({}, planItem, { evidencePackets }), response, evidenceSource));
  }

  const report = rebuildReportFromRows({
    generatedAt: new Date().toISOString(),
    endpoint,
    currentMode,
    model: resolvedModel,
    evidenceProvenance: {
      current_rag_boundary: resolveProductionEvidence ? 'production static assets from live endpoint origin' : 'local eval prompt context',
      old_prompt_boundary: 'local eval prompt context',
      no_rag_boundary: 'local eval prompt context',
      rag_no_boundary: 'local eval prompt context'
    },
    caseCount: evalSet.length,
    callCount: rows.length,
    variants: EVAL_VARIANTS,
    note: 'Automatic metrics are semi-automatic gold-set checks and not a substitute for 20% human claim-level review.',
    rows
  });

  fs.mkdirSync(outDir, { recursive: true });
  const stamp = report.generatedAt.replace(/[:.]/g, '-');
  const jsonPath = path.join(outDir, `live-advisor-eval-${stamp}.json`);
  const markdownPath = path.join(outDir, `live-advisor-eval-${stamp}.md`);
  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  fs.writeFileSync(markdownPath, renderMarkdownReport(report), 'utf8');
  report.outputs = { jsonPath, markdownPath };
  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return report;
}

function parseArgs(argv) {
  const args = {
    fixture: 'tests/fixtures/advisor-qa-eval-set.json',
    endpoint: DEFAULT_LIVE_ENDPOINT,
    outDir: 'output/evals',
    currentMode: 'production',
    model: process.env.LIVE_EVAL_MODEL || process.env.OPENAI_MODEL || ''
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--fixture') args.fixture = argv[++index] || args.fixture;
    if (arg === '--endpoint') args.endpoint = argv[++index] || args.endpoint;
    if (arg === '--out-dir') args.outDir = argv[++index] || args.outDir;
    if (arg === '--model') args.model = argv[++index] || args.model;
    if (arg === '--current-mode') args.currentMode = argv[++index] || args.currentMode;
    if (arg === '--local-current') args.currentMode = 'local';
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const evalSet = loadEvalSet(path.resolve(args.fixture));
  const report = await runLiveEvaluation({
    evalSet,
    dataRoot: process.cwd(),
    outDir: path.resolve(args.outDir),
    endpoint: args.endpoint,
    currentMode: args.currentMode,
    model: args.model
  });
  console.log(JSON.stringify({
    jsonPath: report.outputs.jsonPath,
    markdownPath: report.outputs.markdownPath,
    callCount: report.callCount,
    model: report.model,
    aggregate: report.aggregate,
    comparisons: report.comparisons
  }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error && error.message || error);
    process.exitCode = 1;
  });
}
