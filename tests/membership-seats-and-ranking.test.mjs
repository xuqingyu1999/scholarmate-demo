import assert from 'node:assert';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../scripts/business-core.js', import.meta.url), 'utf8');
const sandbox = { console };
vm.createContext(sandbox);
vm.runInContext(source, sandbox);

const BusinessCore = sandbox.ScholarMateBusinessCore;

assert.strictEqual(BusinessCore.MEMBERSHIP_PLANS.free.advisorSeatLimit, 0);
assert.strictEqual(BusinessCore.MEMBERSHIP_PLANS.free.maxInventors, 0);
assert.strictEqual(BusinessCore.MEMBERSHIP_PLANS.free.dailyTokenLimit, 100);
assert.strictEqual(BusinessCore.MEMBERSHIP_PLANS.professional.advisorSeatLimit, 10);
assert.strictEqual(BusinessCore.MEMBERSHIP_PLANS.professional.dailyTokenLimit, 1000);
assert.strictEqual(BusinessCore.MEMBERSHIP_PLANS.enterprise.advisorSeatLimit, Infinity);
assert.strictEqual(BusinessCore.MEMBERSHIP_PLANS.enterprise.dailyTokenLimit, 5000);
assert.strictEqual(BusinessCore.getAdvisorSeatLimit({ level: 'free', maxInventors: 3 }), 0);
assert.strictEqual(BusinessCore.getAdvisorSeatLimit({ level: 'professional', maxInventors: 3 }), 3);
assert.strictEqual(BusinessCore.getAdvisorSeatLimit({ level: 'enterprise', advisorSeatLimit: null, maxInventors: null }), Infinity);

const freeUser = BusinessCore.activateMembership(BusinessCore.ensureEnterpriseUser(null), 'free');
assert.strictEqual(freeUser.membership.advisorSeatLimit, 0);
assert.strictEqual(freeUser.membership.maxInventors, 0);

const professionalUser = BusinessCore.activateMembership(freeUser, 'professional');
assert.strictEqual(professionalUser.membership.advisorSeatLimit, 10);
assert.strictEqual(professionalUser.membership.maxInventors, 10);

const downgradedUser = BusinessCore.activateMembership({
  ...professionalUser,
  digitalHumanSeats: [{ inventorId: 'inv_001', patentId: 'med-ai', source: 'membership' }]
}, 'free');
assert.strictEqual(Array.isArray(downgradedUser.digitalHumanSeats), true);
assert.strictEqual(downgradedUser.digitalHumanSeats.length, 0);

const membershipHtml = fs.readFileSync(new URL('../membership.html', import.meta.url), 'utf8');
assert.ok(membershipHtml.includes('0 个长期顾问席位'), 'free plan should explicitly say it has no long-term advisor seat');
assert.ok(membershipHtml.includes('10 个顾问席位'), 'professional plan should show advisor seat count');
assert.ok(membershipHtml.includes('不限顾问席位'), 'enterprise plan should show unlimited advisor seats');

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
    id: 'medical-privacy',
    title: '一种医疗数据隐私保护联邦建模方法',
    field: '隐私计算',
    industry: '医疗健康',
    summary: '支持多机构医疗数据不出域协同建模，兼顾模型效果和隐私合规。',
    inventorId: 'inv_006',
    requireLicense: true,
    licensePrice: 2999
  },
  {
    id: 'industrial-ai',
    title: '一种少样本工业视觉缺陷检测方法',
    field: '人工智能',
    industry: '先进制造',
    summary: '通过少样本学习降低缺陷检测标注成本，适合新产线快速上线质检模型。',
    inventorId: 'inv_005',
    requireLicense: false,
    licensePrice: 0
  },
  {
    id: 'rag-ai',
    title: '一种企业知识库RAG推荐问答系统',
    field: '人工智能',
    industry: '企业服务',
    summary: '将企业知识库检索、证据过滤和推荐解释结合，生成可追溯的顾问式回答。',
    inventorId: 'inv_007',
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
  }
];

const rankedMedicalAi = BusinessCore.rankPatentsHybrid({
  query: '人工智能与医疗',
  patents,
  semanticScores: {
    'med-ai': 0.9,
    'medical-privacy': 0.93,
    'industrial-ai': 0.95,
    'rag-ai': 0.94,
    battery: 0.2
  },
  user: professionalUser
});

assert.strictEqual(rankedMedicalAi[0].patentId, 'med-ai');
assert.ok(rankedMedicalAi[0].score >= 40);
assert.strictEqual(rankedMedicalAi.find(item => item.patentId === 'medical-privacy').score, 0);
assert.strictEqual(rankedMedicalAi.find(item => item.patentId === 'industrial-ai').score, 0);
assert.strictEqual(rankedMedicalAi.find(item => item.patentId === 'rag-ai').score, 0);

const rankedPrivacy = BusinessCore.rankPatentsHybrid({
  query: '隐私保护 医疗数据 上链',
  patents,
  semanticScores: {
    'med-ai': 0.86,
    'medical-privacy': 0.9,
    'industrial-ai': 0.2,
    'rag-ai': 0.25,
    battery: 0.1
  },
  user: professionalUser
});

assert.strictEqual(rankedPrivacy[0].patentId, 'medical-privacy');
assert.strictEqual(rankedPrivacy.find(item => item.patentId === 'med-ai').score, 0);

console.log('membership seats and ranking tests passed');
