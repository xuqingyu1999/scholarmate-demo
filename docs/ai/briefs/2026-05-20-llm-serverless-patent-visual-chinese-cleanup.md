# LLM Serverless, Patent Visual, and Chinese Data Cleanup Brief

## Goal

Move digital-scholar LLM calls behind a server-side `/api/chat` proxy, remove client-side API key/model configuration, improve patent preview image quality or fall back cleanly, remove user-visible Google Patents branding, and localize scholar/institution metadata to Chinese.

## Acceptance Criteria

- `chat.html` no longer renders API key/baseURL/model inputs and no longer stores LLM config in `sessionStorage`.
- Frontend chat calls `/api/chat`; request payload does not include API keys, base URLs, or model names.
- A Vercel-style serverless handler reads `OPENAI_API_KEY`, `OPENAI_BASE_URL`, and `OPENAI_MODEL` from environment variables and calls an OpenAI-compatible chat completions endpoint.
- Existing persona and knowledge-boundary prompt assembly remains reused and testable.
- `file://` or unavailable `/api/chat` keeps local demo replies without exposing customer-facing API configuration UI.
- User-visible product text does not say `Google Patents`; user-facing caveats say legal status and license conclusions require secondary verification.
- Internal traceability URLs may remain in data, but UI labels and tests must not present Google Patents as the public source.
- Patent preview images are not enlarged from tiny 120px assets. High-resolution local assets are used when available; records without acceptable local images use a stable public-text fallback instead of blurry images.
- `inventors.affiliation`, `patents.assignee`, persona titles, and SVG avatar labels use Chinese institution names.
- Tests cover LLM proxy behavior, no frontend secret storage, no user-visible Google Patents copy, Chinese institution metadata, and patent image threshold/fallback behavior.

## Known Chinese Institution Names

- Institute of Artificial Intelligence of Hefei Comprehensive National Science Center -> 合肥综合性国家科学中心人工智能研究院
- WeBank Co Ltd -> 深圳前海微众银行股份有限公司（微众银行）
- Tsinghua University -> 清华大学
- BMW China Services Ltd -> 宝马（中国）服务有限公司
- Zhejiang University -> 浙江大学
- State Grid Corporation of China -> 国家电网有限公司
- Plant Protection Research Institute Guangdong Academy of Agricultural Sciences -> 广东省农业科学院植物保护研究所
- Peking University -> 北京大学

## Constraints

- Keep global contracts `inventors`, `patents`, `patentDetails`, `getPatentById()`.
- Keep current static prototype pages working under `file://`.
- Do not add runtime persona distillation, embeddings, or user-facing source branding.
- Use TDD for behavior changes and run the full Node test suite plus browser smoke checks.
