import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const REQUIRED_FIELDS = [
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
];

function normalizeText(value) {
  return String(value || '').toLowerCase();
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function toKey(packet) {
  if (packet && packet.citationKey) return String(packet.citationKey);
  const sourceType = String(packet && packet.sourceType || '').toUpperCase();
  const id = String(packet && packet.id || '');
  return sourceType && id ? `${sourceType}:${id}` : '';
}

function avg(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + Number(value || 0), 0) / values.length;
}

function createStorageStub() {
  return {
    getItem() { return null; },
    setItem() {},
    removeItem() {},
    key() { return null; },
    get length() { return 0; }
  };
}

function loadUmdApi(filePath, globalName) {
  const source = fs.readFileSync(filePath, 'utf8');
  const sandbox = { console };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  if (!sandbox[globalName]) throw new Error(`${globalName} unavailable`);
  return sandbox[globalName];
}

function loadMainData(rootDir) {
  const source = fs.readFileSync(path.join(rootDir, 'scripts/main.js'), 'utf8');
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

function buildRetrieverEvidence(testCase, { rootDir, ragEnabled }) {
  const AdvisorRag = loadUmdApi(path.join(rootDir, 'scripts/advisor-rag.js'), 'ScholarMateAdvisorRag');
  const { inventors, patents } = loadMainData(rootDir);
  const inventor = inventors.find(item => item && item.id === testCase.inventorId);
  const patent = patents.find(item => item && item.id === testCase.patentId);
  const assets = loadScholarAssets(rootDir, testCase.inventorId);
  const collaborationPlaybook = loadJsonIfExists(path.join(rootDir, 'data/collaboration-playbook.json'), []);
  return AdvisorRag.buildEvidenceContext({
    inventor,
    patent,
    knowledgePatents: patents.filter(item => item && item.inventorId === testCase.inventorId),
    knowledgeIndex: assets.knowledgeIndex || {},
    paperManifest: assets.paperManifest || {},
    collaborationPlaybook,
    question: testCase.question,
    ragEnabled
  }).evidencePackets || [];
}

export function loadEvalSet(fileUrlOrPath) {
  const resolved = fileUrlOrPath instanceof URL
    ? fileUrlOrPath
    : path.resolve(String(fileUrlOrPath || ''));
  const raw = fs.readFileSync(resolved, 'utf8');
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error('eval set must be an array');
  return parsed;
}

export function validateEvalSet(evalSet) {
  const errors = [];
  const items = toArray(evalSet);
  const ids = new Set();

  items.forEach((item, index) => {
    if (!item || typeof item !== 'object') {
      errors.push(`item ${index} must be an object`);
      return;
    }
    REQUIRED_FIELDS.forEach(field => {
      if (!(field in item)) errors.push(`item ${index} missing ${field}`);
    });
    if (item.id && ids.has(item.id)) errors.push(`duplicate id: ${item.id}`);
    ids.add(item.id);
    if (!Array.isArray(item.qrels)) errors.push(`${item.id || index} qrels must be array`);
    if (!Array.isArray(item.requiredClaims)) errors.push(`${item.id || index} requiredClaims must be array`);
    if (!Array.isArray(item.forbiddenClaims)) errors.push(`${item.id || index} forbiddenClaims must be array`);
    if (!Array.isArray(item.acceptableBoundaryLanguage)) errors.push(`${item.id || index} acceptableBoundaryLanguage must be array`);
  });

  return { errors };
}

export function scoreRetrieval({ qrels = [], evidencePackets = [], k = 5 } = {}) {
  const topPackets = toArray(evidencePackets).slice(0, Math.max(1, Number(k) || 5));
  const rankedKeys = topPackets.map(toKey).filter(Boolean);
  const judged = toArray(qrels)
    .filter(item => item && item.sourceId)
    .map(item => ({ sourceId: String(item.sourceId), relevance: Number(item.relevance || 0) }));
  const relevantJudgments = judged.filter(item => item.relevance > 0);

  if (!relevantJudgments.length) {
    return {
      recallAtK: 0,
      mrrAtK: 0,
      ndcgAtK: 0,
      contextRelevance: 0,
      contextNoise: rankedKeys.length ? 1 : 0
    };
  }

  const relevantIds = new Set(relevantJudgments.map(item => item.sourceId));
  const hits = rankedKeys.filter(key => relevantIds.has(key));
  const recallAtK = hits.length / relevantIds.size;

  let reciprocalRank = 0;
  for (let index = 0; index < rankedKeys.length; index += 1) {
    if (relevantIds.has(rankedKeys[index])) {
      reciprocalRank = 1 / (index + 1);
      break;
    }
  }

  const relevanceById = new Map(relevantJudgments.map(item => [item.sourceId, item.relevance]));
  let dcg = 0;
  for (let i = 0; i < rankedKeys.length; i += 1) {
    const rel = Number(relevanceById.get(rankedKeys[i]) || 0);
    if (rel <= 0) continue;
    dcg += rel / Math.log2(i + 2);
  }
  const idealRel = relevantJudgments
    .map(item => Number(item.relevance || 0))
    .sort((a, b) => b - a)
    .slice(0, rankedKeys.length);
  let idcg = 0;
  for (let i = 0; i < idealRel.length; i += 1) {
    if (idealRel[i] <= 0) continue;
    idcg += idealRel[i] / Math.log2(i + 2);
  }
  const ndcgAtK = idcg > 0 ? dcg / idcg : 0;

  const contextRelevance = rankedKeys.length ? (hits.length / rankedKeys.length) : 0;
  const contextNoise = rankedKeys.length ? 1 - contextRelevance : 0;

  return {
    recallAtK,
    mrrAtK: reciprocalRank,
    ndcgAtK,
    contextRelevance,
    contextNoise
  };
}

export function scoreAnswer({ testCase = {}, answer = '', evidencePackets = [] } = {}) {
  const answerText = normalizeText(answer);
  const requiredClaims = toArray(testCase.requiredClaims).map(String);
  const forbiddenClaims = toArray(testCase.forbiddenClaims).map(String);
  const acceptableBoundaryLanguage = toArray(testCase.acceptableBoundaryLanguage).map(String);

  const requiredHits = requiredClaims.filter(claim => answerText.includes(normalizeText(claim)));
  const requiredClaimRecall = requiredClaims.length ? requiredHits.length / requiredClaims.length : 1;

  const forbiddenHitList = forbiddenClaims.filter(claim => answerText.includes(normalizeText(claim)));
  const forbiddenClaimCount = forbiddenHitList.length;

  const citationRegex = /\[([A-Z]+:[^\]\s]+)\]/g;
  const citedKeys = [];
  let match = null;
  while ((match = citationRegex.exec(String(answer || ''))) !== null) {
    citedKeys.push(match[1]);
  }

  const evidenceKeys = new Set(toArray(evidencePackets).map(toKey).filter(Boolean));
  const validCitations = citedKeys.filter(key => evidenceKeys.has(key));
  const invalidCitationCount = citedKeys.length - validCitations.length;
  const citationPrecision = citedKeys.length ? (validCitations.length / citedKeys.length) : 1;
  const citationRecall = evidenceKeys.size ? (new Set(validCitations).size / evidenceKeys.size) : 1;

  const sectionKeywords = ['核心判断', '依据', '适用条件', '风险边界', '下一步建议'];
  const sectionHitCount = sectionKeywords.filter(section => answer.includes(section)).length;
  const sectionCompliance = sectionHitCount / sectionKeywords.length;

  const boundaryRequired = String(testCase.expectedBehavior || '').toLowerCase() === 'boundary';
  const boundaryHit = acceptableBoundaryLanguage.some(fragment => answerText.includes(normalizeText(fragment)));
  const boundaryAcceptable = boundaryRequired ? boundaryHit : true;
  const overRefusal = !boundaryRequired && boundaryHit;

  return {
    requiredClaimRecall,
    forbiddenClaimCount,
    sectionCompliance,
    citationRecall,
    citationPrecision,
    invalidCitationCount,
    boundaryRequired,
    boundaryHit,
    boundaryAcceptable,
    overRefusal
  };
}

function buildMockEvidence(testCase) {
  const qrels = toArray(testCase.qrels);
  const packets = qrels.slice(0, 5).map(item => {
    const sourceId = String(item.sourceId || '');
    const [prefix, ...rest] = sourceId.split(':');
    const sourceTypeMap = {
      PATENT: 'patent',
      PAPER: 'paper_pdf',
      META: 'paper_metadata',
      PLAYBOOK: 'collab_playbook'
    };
    return {
      citationKey: sourceId,
      id: rest.join(':') || sourceId,
      sourceType: sourceTypeMap[prefix] || 'patent'
    };
  });
  if (!packets.length) {
    packets.push({
      citationKey: `PATENT:${testCase.patentId}`,
      id: testCase.patentId,
      sourceType: 'patent'
    });
  }
  return packets;
}

function buildMockAnswer(testCase, evidencePackets) {
  const required = toArray(testCase.requiredClaims);
  const boundaryRequired = String(testCase.expectedBehavior || '').toLowerCase() === 'boundary';
  const boundary = boundaryRequired
    ? (toArray(testCase.acceptableBoundaryLanguage)[0] || 'cannot provide official terms')
    : '';
  const citation = evidencePackets[0] ? `[${toKey(evidencePackets[0])}]` : '';
  return [required.join(' '), boundary, citation].filter(Boolean).join(' ').trim();
}

export function runDryEvaluation({ evalSet = [], mode = 'retriever', ragEnabled = true, dataRoot = process.cwd() } = {}) {
  const items = toArray(evalSet);
  const rootDir = path.resolve(String(dataRoot || process.cwd()));
  const cases = items.map(testCase => {
    const evidencePackets = mode === 'mock'
      ? buildMockEvidence(testCase)
      : buildRetrieverEvidence(testCase, { rootDir, ragEnabled });
    const retrieval = scoreRetrieval({
      qrels: testCase.qrels,
      evidencePackets,
      k: 5
    });
    const answer = buildMockAnswer(testCase, evidencePackets);
    const answerMetrics = scoreAnswer({
      testCase,
      answer,
      evidencePackets
    });
    return {
      id: testCase.id,
      category: testCase.category,
      inventorId: testCase.inventorId,
      patentId: testCase.patentId,
      retrieved: evidencePackets.map(packet => toKey(packet)).filter(Boolean),
      retrieval,
      answerMetrics
    };
  });

  const aggregate = {
    retrieval: {
      recallAt5: avg(cases.map(item => item.retrieval.recallAtK)),
      mrrAt5: avg(cases.map(item => item.retrieval.mrrAtK)),
      ndcgAt5: avg(cases.map(item => item.retrieval.ndcgAtK))
    },
    context: {
      relevanceRatio: avg(cases.map(item => item.retrieval.contextRelevance)),
      noiseRatio: avg(cases.map(item => item.retrieval.contextNoise))
    },
    answers: {
      requiredClaimRecall: avg(cases.map(item => item.answerMetrics.requiredClaimRecall)),
      forbiddenClaimCount: avg(cases.map(item => item.answerMetrics.forbiddenClaimCount)),
      sectionCompliance: avg(cases.map(item => item.answerMetrics.sectionCompliance)),
      citationRecall: avg(cases.map(item => item.answerMetrics.citationRecall)),
      citationPrecision: avg(cases.map(item => item.answerMetrics.citationPrecision)),
      invalidCitationCount: avg(cases.map(item => item.answerMetrics.invalidCitationCount))
    },
    boundary: (() => {
      const boundaryCases = cases.filter(item => item.answerMetrics.boundaryRequired);
      const tp = boundaryCases.filter(item => item.answerMetrics.boundaryHit).length;
      const precisionDenominator = cases.filter(item => item.answerMetrics.boundaryHit).length;
      return {
        boundaryPrecision: precisionDenominator ? (tp / precisionDenominator) : 0,
        boundaryRecall: boundaryCases.length ? (tp / boundaryCases.length) : 0,
        overRefusalRate: avg(cases.map(item => item.answerMetrics.overRefusal ? 1 : 0)),
        boundaryAcceptableRatio: avg(cases.map(item => item.answerMetrics.boundaryAcceptable ? 1 : 0))
      };
    })()
  };

  return {
    generatedAt: new Date().toISOString(),
    mode,
    answerMode: 'mock_expected_claims',
    answerMetricsNote: 'Answer metrics score deterministic mock answers built from expected claims. They validate metric plumbing only; use live or manually reviewed answers for real answer-quality conclusions.',
    ragEnabled: !!ragEnabled,
    caseCount: items.length,
    aggregate,
    cases
  };
}

function parseCliArgs(argv) {
  const args = {
    fixture: 'tests/fixtures/advisor-qa-eval-set.json',
    out: '',
    mode: 'retriever',
    ragEnabled: true
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--fixture') args.fixture = argv[++index] || args.fixture;
    if (arg === '--out') args.out = argv[++index] || '';
    if (arg === '--mock') args.mode = 'mock';
    if (arg === '--baseline') args.ragEnabled = false;
    if (arg === '--rag-off') args.ragEnabled = false;
  }
  return args;
}

function main() {
  const rootDir = process.cwd();
  const args = parseCliArgs(process.argv.slice(2));
  const evalSet = loadEvalSet(path.resolve(rootDir, args.fixture));
  const validation = validateEvalSet(evalSet);
  if (validation.errors.length) {
    console.error(JSON.stringify({ errors: validation.errors }, null, 2));
    process.exitCode = 1;
    return;
  }
  const report = runDryEvaluation({
    evalSet,
    mode: args.mode,
    ragEnabled: args.ragEnabled,
    dataRoot: rootDir
  });
  const json = JSON.stringify(report, null, 2);
  if (args.out) {
    const outPath = path.resolve(rootDir, args.out);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, `${json}\n`, 'utf8');
  } else {
    console.log(json);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
