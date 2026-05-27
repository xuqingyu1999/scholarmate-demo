# Chat history LLM unavailable regression

## Summary
线上第一次数字学者对话可以调用 LLM，但第二轮及后续问题可能显示 `Model service temporarily unavailable.`。初步定位为第二轮请求会携带上一轮对话历史，而服务端对单条 history content 有长度上限；上一轮 LLM 回复较长时，前端未裁剪就发送，导致 `/api/chat` 在调用模型前拒绝请求。

## Acceptance Criteria
- 前端发送到 `/api/chat` 的 `history` 每条 content 都符合服务端长度边界。
- 第二轮带长 AI 回复历史时，客户端 payload 仍可通过服务端 history 校验。
- 错误提示避免把 400 类客户端校验错误伪装成模型服务不可用。
- 现有 serverless-only、无前端 API key 约束保持不变。
- `node tests/llm-client.test.mjs`、`node tests/api-chat.test.mjs` 和完整 `tests/*.test.mjs` 通过。

## Notes
- 服务端仍保留 history 长度防线，防止非前端客户端发送过大 payload。
- 前端只裁剪历史转录，不裁剪当前用户问题；当前问题仍由 `/api/chat` 的 `MAX_QUESTION_CHARS` 校验。
