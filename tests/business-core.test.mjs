import assert from 'node:assert';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../scripts/business-core.js', import.meta.url), 'utf8');
const sandbox = { console };
vm.createContext(sandbox);
vm.runInContext(source, sandbox);

const BusinessCore = sandbox.ScholarMateBusinessCore;

const patents = [
  {
    id: 'p1',
    title: 'AI medical diagnosis system',
    field: '人工智能',
    industry: '医疗健康',
    summary: '医学影像辅助诊断',
    inventorId: 'inv_001',
    requireLicense: false,
    licensePrice: 0,
    risks: ['需要医院影像数据适配']
  },
  {
    id: 'p2',
    title: 'Battery thermal management',
    field: '新能源',
    industry: '新能源汽车',
    summary: '电池热管理',
    inventorId: 'inv_002',
    requireLicense: true,
    licenseTier: 'standard',
    licensePrice: 2999,
    risks: ['量产前需要热仿真验证']
  },
  {
    id: 'p3',
    title: 'Blockchain privacy for medical data',
    field: '区块链',
    industry: '金融科技',
    summary: '医疗数据上链隐私保护',
    inventorId: 'inv_004',
    requireLicense: true,
    licenseTier: 'premium',
    licensePrice: 3999,
    risks: ['需要合规评估']
  }
];

const project = BusinessCore.createDemandProject({
  title: '基层医院影像诊断效率提升',
  industry: '医疗健康',
  budget: '20-50万',
  stage: '试点验证',
  description: '希望用AI医学影像能力提升基层医生诊断效率',
  companyContext: '连锁基层医疗机构'
}, patents);

assert.strictEqual(project.recommendations.length, 3);
assert.strictEqual(project.recommendations[0].patentId, 'p1');
assert.ok(project.recommendations[0].matchReasons.join('').includes('医疗健康'));
assert.ok(project.recommendations[0].nextAction.includes('数字发明人'));

const user = BusinessCore.ensureEnterpriseUser(null);
assert.strictEqual(BusinessCore.isEnterpriseVerified(user), false);
assert.strictEqual(BusinessCore.canPerformCommercialAction(user).allowed, false);

const pendingUser = BusinessCore.startMicroDepositVerification(user, {
  companyName: '华创科技有限公司',
  bankAccount: '6222000000000000',
  bankName: '招商银行上海分行'
}, 0.37);

assert.strictEqual(BusinessCore.confirmMicroDeposit(pendingUser, 0.12).verification.status, 'failed');
const verifiedUser = BusinessCore.confirmMicroDeposit(pendingUser, 0.37);
assert.strictEqual(BusinessCore.isEnterpriseVerified(verifiedUser), true);

const memberUser = BusinessCore.activateMembership(verifiedUser, 'professional');
assert.strictEqual(memberUser.membership.projectLimit, 8);
assert.strictEqual(memberUser.membership.dailyTokenLimit, 500);
assert.strictEqual(BusinessCore.canCreateDemandProject(memberUser, Array(8).fill({})).allowed, false);
assert.strictEqual(BusinessCore.canCreateDemandProject(memberUser, Array(7).fill({})).allowed, true);

assert.strictEqual(BusinessCore.canChatAboutPatent(memberUser, patents[1], []).allowed, false);
assert.strictEqual(BusinessCore.canChatAboutPatent({
  ...memberUser,
  purchasedLicenses: ['p2']
}, patents[1], ['p2']).allowed, true);

assert.strictEqual(BusinessCore.isFreeSharedPatent(patents[0]), true);
assert.strictEqual(BusinessCore.getPatentLicensePrice(patents[0]), 0);
assert.strictEqual(BusinessCore.getPatentLicensePrice(patents[1]), 2999);
assert.strictEqual(BusinessCore.getPatentLicenseLabel(patents[1]), '¥2,999/年 资料/对话许可');
assert.strictEqual(BusinessCore.isFreeSharedPatent({ id: 'p4', requireLicense: true }), true);
assert.strictEqual(BusinessCore.getPatentLicensePrice({ id: 'p4', requireLicense: true }), 0);
assert.strictEqual(BusinessCore.canChatAboutPatent(memberUser, { id: 'p4', requireLicense: true }, []).allowed, true);

assert.strictEqual(BusinessCore.canBookAppointment(memberUser, patents[0]).allowed, true);
assert.strictEqual(BusinessCore.canBookAppointment(verifiedUser, patents[0]).allowed, false);
assert.strictEqual(BusinessCore.canBookAppointment(verifiedUser, patents[1]).allowed, false);
assert.strictEqual(BusinessCore.canBookAppointment({ ...verifiedUser, purchasedLicenses: ['p2'] }, patents[1]).allowed, true);

const rankedMedical = BusinessCore.rankPatentsHybrid({
  query: '基层医院影像诊断效率提升',
  project,
  patents,
  semanticScores: { p1: 0.91, p2: 0.12, p3: 0.22 },
  user: memberUser
});
assert.strictEqual(rankedMedical[0].patentId, 'p1');
assert.ok(rankedMedical[0].explanations.join('').includes('语义'));

const rankedBattery = BusinessCore.rankPatentsHybrid({
  query: '电池高温安全和热失控',
  patents,
  semanticScores: { p1: 0.1, p2: 0.9, p3: 0.2 },
  user: memberUser
});
assert.strictEqual(rankedBattery[0].patentId, 'p2');

const rankedPrivacy = BusinessCore.rankPatentsHybrid({
  query: '隐私保护 医疗数据 上链',
  patents,
  semanticScores: { p1: 0.24, p2: 0.14, p3: 0.88 },
  user: memberUser
});
assert.strictEqual(rankedPrivacy[0].patentId, 'p3');

assert.strictEqual(BusinessCore.rankPatentsHybrid({
  query: '基层医院影像诊断效率提升',
  patents,
  user: memberUser
})[0].patentId, 'p1');

assert.strictEqual(BusinessCore.rankPatentsHybrid({
  query: '电池高温安全和热失控',
  patents,
  user: memberUser
})[0].patentId, 'p2');

assert.strictEqual(BusinessCore.rankPatentsHybrid({
  query: '隐私保护 医疗数据 上链',
  patents,
  user: memberUser
})[0].patentId, 'p3');

const intent = BusinessCore.createTradeIntent(memberUser, {
  projectId: project.id,
  patentId: 'p1',
  contactName: '张明',
  contactPhone: '13812345678',
  message: '希望进一步评估采购和试点合作'
});

assert.strictEqual(intent.status, '待跟进');
assert.strictEqual(intent.patentId, 'p1');

const answer = BusinessCore.composeAdvisorReply({
  inventorName: '张明远',
  patent: patents[0],
  project,
  question: '这项专利适合我们吗？'
});

assert.ok(answer.includes('基层医院影像诊断效率提升'));
assert.ok(answer.includes('企业能理解'));
assert.ok(answer.includes('提交交易意向'));

const zhaoLikeScholar = {
  id: 'zhao_jianliang_leon',
  name: 'Jianliang Leon ZHAO',
  expertise: ['blockchain', 'digital finance', 'smart contract security'],
  skills: [
    { id: 'patent_fact_extractor', name: 'Patent Fact Extractor', priority: 100 },
    { id: 'paper_evidence_retriever', name: 'Paper Evidence Retriever', priority: 80 },
    { id: 'commercialization_assessor', name: 'Commercialization Assessor', priority: 70 },
    { id: 'technical_due_diligence', name: 'Technical Due Diligence', priority: 65 },
    { id: 'risk_guard', name: 'Risk Guard', priority: 100 },
    { id: 'citation_answer_builder', name: 'Citation Answer Builder', priority: 75 }
  ],
  rules: {
    identityRules: [{ id: 'identity_controlled_proxy', priority: 100, text: 'controlled proxy' }],
    evidenceRules: [{ id: 'evidence_metadata_limit', priority: 90, text: 'metadata-only is not full text' }],
    scholarRules: [{ id: 'scholar_field_scope', priority: 80, text: 'stay in scholar field scope' }]
  },
  knowledgeIndex: {
    chunks: [{
      paperId: 'paper_blockchain_pdf',
      sourceType: 'paper_pdf',
      title: 'Blockchain and Digital Finance',
      year: '2022',
      text: 'Blockchain digital finance systems depend on secure key management, smart contract security and trustworthy financial infrastructure.',
      topicTags: ['blockchain', 'digital finance', 'smart contract'],
      confidence: 'high',
      sourceUrl: 'https://example.test/blockchain',
      page: 2
    }],
    metadataRecords: [{
      paperId: 'paper_security_metadata',
      sourceType: 'paper_metadata',
      title: 'Blockchain Security: A Survey',
      year: '2021',
      description: 'Metadata-only record about blockchain security techniques and research directions.',
      topicTags: ['blockchain security'],
      confidence: 'high',
      sourceUrl: 'https://example.test/metadata'
    }]
  }
};

const blockchainPatent = {
  id: 'CN114117510B',
  title: 'Random private key storage method and device',
  field: 'blockchain-trust',
  industry: '区块链可信内容',
  summary: 'A private-key storage and invocation method for blockchain systems.',
  sourceUrl: 'https://scholars.cityu.edu.hk/en/publications/private-key/',
  patentRules: [{ id: 'patent_first', priority: 100, text: 'patent first' }]
};

const advisorContext = BusinessCore.buildAdvisorContext({
  inventor: zhaoLikeScholar,
  patent: blockchainPatent,
  question: '这个私钥专利有什么区块链安全研究基础？'
});

assert.strictEqual(advisorContext.intent.id, 'research_basis');
assert.ok(advisorContext.triggeredSkills.some(skill => skill.id === 'paper_evidence_retriever'), 'research questions should trigger paper evidence retrieval');
assert.ok(advisorContext.triggeredSkills.some(skill => skill.id === 'risk_guard'), 'all advisor answers should trigger risk guard');
assert.strictEqual(advisorContext.paperEvidence[0].title, 'Blockchain and Digital Finance');
assert.strictEqual(advisorContext.paperEvidence[0].sourceType, 'paper_pdf');

const groundedAnswer = BusinessCore.composeAdvisorReply({
  inventor: zhaoLikeScholar,
  patent: blockchainPatent,
  question: '这个私钥专利有什么区块链安全研究基础？'
});
assert.ok(groundedAnswer.includes('已下载公开PDF'), 'local advisor reply should identify downloaded PDF evidence');
assert.ok(groundedAnswer.includes('metadata-only'), 'local advisor reply should explain metadata-only limitations');

const riskAnswer = BusinessCore.composeAdvisorReply({
  inventor: zhaoLikeScholar,
  patent: blockchainPatent,
  question: '这是不是侵权？'
});
assert.ok(riskAnswer.includes('不能直接判断是否侵权'), 'legal-risk questions should avoid legal conclusions');

console.log('business-core tests passed');
