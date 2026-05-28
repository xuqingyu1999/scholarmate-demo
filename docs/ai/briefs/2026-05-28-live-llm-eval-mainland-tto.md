# Live LLM Evaluation And Mainland China TTO Evidence

## Goal
Run a real online LLM evaluation for the CityU digital scholar RAG chat using the full 36-question gold set and four fixed variants. Extend the collaboration playbook with mainland China policy/university technology-transfer references while keeping the playbook generic and not CityU official guidance.

## Acceptance Criteria
- Add a live eval runner that can execute 36 questions across four variants: `current_rag_boundary`, `old_prompt_boundary`, `no_rag_boundary`, and `rag_no_boundary`.
- `current_rag_boundary` uses the deployed Vercel `/api/chat` endpoint without changing its public request/response payload.
- Other variants are local eval-only OpenAI-compatible calls and are never exposed through `/api/chat`.
- Reports are written under `output/evals/` as JSON and Markdown, and those outputs are not committed.
- Reports include aggregate retrieval, answer, citation, and boundary metrics plus deltas versus the current RAG+boundary variant.
- The report states that automatic answer metrics are semi-automatic gold-set checks and not a substitute for 20% human claim-level review.
- Collaboration playbook entries include mainland China `sourceRationale` / source URLs and still state that they are generic practice, not CityU official terms.
- Full `tests/*.test.mjs` passes after implementation.

## Test Plan
- Unit tests prove variant prompt construction, production payload preservation, no-boundary ablation, and China source rationale fields.
- Mock transport test runs the full 36 x 4 report without LLM calls.
- Failure test proves a 401/503/502 online current call aborts cleanly and does not write misleading report files.
- Live run executes 144 LLM calls when environment is ready.
