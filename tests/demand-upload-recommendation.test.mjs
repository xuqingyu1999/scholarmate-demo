import assert from 'node:assert';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../scripts/business-core.js', import.meta.url), 'utf8');
const mainSource = fs.readFileSync(new URL('../scripts/main.js', import.meta.url), 'utf8');
const sandbox = { console };
vm.createContext(sandbox);
vm.runInContext(source, sandbox);

const BusinessCore = sandbox.ScholarMateBusinessCore;

const patents = [
  {
    id: 'med-ai',
    title: '一种基于人工智能的医疗诊断系统及方法',
    field: '人工智能',
    industry: '医疗健康',
    summary: '面向基层医院医学影像辅助诊断，提升医生阅片效率和诊断解释能力。',
    inventorId: 'inv_001',
    requireLicense: false,
    licensePrice: 0
  },
  {
    id: 'smart-home',
    title: '一种智能家居控制系统及其控制方法',
    field: '物联网',
    industry: '智能家居',
    summary: '通过物联网技术实现家居设备互联互通，支持语音控制和远程管理。',
    inventorId: 'inv_003',
    requireLicense: false,
    licensePrice: 0
  },
  {
    id: 'factory-energy',
    title: '一种制造车间能耗优化调度方法',
    field: '智能制造',
    industry: '工业节能',
    summary: '根据订单节拍、设备负荷和电价波动生成车间能耗优化调度建议。',
    inventorId: 'inv_005',
    requireLicense: false,
    licensePrice: 0
  },
  {
    id: 'battery',
    title: '一种新能源汽车电池热管理系统',
    field: '新能源',
    industry: '新能源汽车',
    summary: '提升电池温度控制能力，提高寿命、安全性和极端环境稳定性。',
    inventorId: 'inv_002',
    requireLicense: true,
    licensePrice: 2999
  },
  {
    id: 'rag-ai',
    title: '一种企业知识库RAG推荐问答系统',
    field: '人工智能',
    industry: '企业服务',
    summary: '将企业知识库检索、证据过滤和推荐解释结合。',
    inventorId: 'inv_007',
    requireLicense: false,
    licensePrice: 0
  }
];

const ranked = BusinessCore.rankPatentsHybrid({
  query: '人工智能与医疗',
  patents,
  user: null
});

assert.strictEqual(ranked[0].patentId, 'med-ai');
assert.ok(ranked[0].score >= 25, `expected medical AI score to be meaningful, got ${ranked[0].score}`);
assert.ok(
  ranked.find(item => item.patentId === 'smart-home').score === 0,
  'free smart-home patent should not be promoted by commercial boost when unrelated'
);
assert.ok(
  ranked.find(item => item.patentId === 'factory-energy').score === 0,
  'free factory-energy patent should not be promoted by commercial boost when unrelated'
);
assert.ok(
  !ranked.find(item => item.patentId === 'smart-home').explanations.join('').includes('免费共享'),
  'unrelated free patent should not show commercial boost as match reason'
);
assert.strictEqual(
  ranked.find(item => item.patentId === 'rag-ai').score,
  0,
  'generic AI patent should not pass a medical query without medical context'
);

const draft = BusinessCore.parseDemandText(
  '基层医院影像诊断效率提升\n希望用AI医学影像能力提升基层医生诊断效率，优先考虑能快速试点、可解释性较强的方案。<script>alert(1)</script>'
);

assert.strictEqual(draft.title, '基层医院影像诊断效率提升');
assert.strictEqual(draft.industry, '医疗健康');
assert.strictEqual(draft.stage, '试点验证');
assert.ok(draft.description.includes('AI医学影像能力'));
assert.ok(draft.description.includes('<script>alert(1)</script>'), 'parser should preserve text for later escaping, not execute it');
assert.ok(draft.summary.length <= 90);
assert.ok(
  !mainSource.includes("|| /^text\\//i.test(file.type || '')"),
  'demand upload should not accept every text/* MIME type; v1 only supports .txt/.md'
);
assert.ok(
  mainSource.includes("/\\.(txt|md)$/i.test(file.name || '')"),
  'demand upload should validate .txt/.md by extension'
);

const batteryDraft = BusinessCore.parseDemandText('电池高温安全和热失控\n准备采购评估新能源电池热管理方案。');
assert.strictEqual(batteryDraft.industry, '新能源汽车');
assert.strictEqual(batteryDraft.stage, '采购评估');

const privacyDraft = BusinessCore.parseDemandText('隐私保护 医疗数据 上链\n需要调研多机构医疗数据不出域协同建模。');
assert.strictEqual(privacyDraft.industry, '医疗健康');
assert.strictEqual(privacyDraft.stage, '方案调研');

console.log('demand upload recommendation tests passed');
