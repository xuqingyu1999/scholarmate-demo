# ScholarMate 第三轮：真实 LLM 数字人、资产席位与会话体验

## Summary
- 继续保持静态前端原型，不新增正式后端。
- 语义推荐维持浏览器远程加载 `Xenova/multilingual-e5-small`，失败时展示更具体原因并回退到本地规则。
- 数字人对话升级为“我的数字人资产 + 多会话 + OpenAI-compatible 纯前端演示 Key”。

## Acceptance Criteria
- 用户中心左侧一级菜单只切换一级内容面板，不影响“我的发布”内部二级 tab；点击同步 URL hash，刷新后能恢复。
- 用户中心新增“我的数字人资产”，能展示已加入会员席位的数字人和已购付费专利许可自动获得的数字人资产。
- 免费认证版不能加入长期数字人席位；专业版/企业版可加入，且受 `maxInventors` 限制。
- `ChatSessions` 使用 `scholarmate_chat_sessions_v2` 保存多会话，并能迁移旧 `chat_history_*`，不删除旧数据。
- 聊天页显示当前数字人的会话列表，支持新建会话和继续会话；每个 session 独立保存消息。
- `LlmClient` 配置只保存到 `sessionStorage` 的 `scholarmate_llm_config_session`，不写入 `localStorage`、DOM、聊天历史或日志。
- 未配置 LLM 时聊天页显示演示模式配置入口；配置后按 OpenAI-compatible `POST /chat/completions` 发送非流式请求。
- LLM 成功响应写入当前 session；401、网络/CORS、响应格式异常显示明确错误，并可回退到本地模拟回复。
- 语义模型加载失败状态区分超时、网络不可达和一般失败；提供重试入口，失败不阻塞推荐。

## Test Plan
- Node tests: `business-core.test.mjs`、`semantic-search.test.mjs`、新增 chat/session/LLM 行为测试。
- Browser smoke: 用户中心一级菜单/hash、数字人资产入口、聊天页新建/继续会话、LLM mock 成功与失败、语义模型阻断回退。
- Static checks: `node --check` 核心脚本和 HTML inline script parse。

## Assumptions
- 纯前端 API key 是演示模式，生产必须改为后端代理或短期 client secret。
- OpenAI-compatible 默认由用户填写 `baseURL`、`model`、`apiKey`，不硬编码供应商。
- v1 不做流式输出、语音、真实客服排班、真实支付或合同授权。
