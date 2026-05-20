# Digital Scholar Boundary + Persona LLM Brief

## Goal

Implement the A+B digital scholar design:

- A: knowledge boundary control through a three-layer prompt contract.
- B: stable scholar persona cards injected into real LLM calls.
- Real LLM path should use the existing OpenAI-compatible `LlmClient` when configured, while preserving local demo fallback.

## Core Product Rules

- Digital scholars are grounded in real scholar assets: patents, public research direction summaries, and field common knowledge.
- The LLM, constrained by prompt, decides whether a question is layer 1 patent evidence, layer 2 public scholar profile, layer 3 field common knowledge, or out of boundary.
- The frontend must not implement boundary decisions by keyword/regex.
- Rejection must never guide users toward payment, upgrades, advisor seats, or dialogue licenses.
- Persona cards are static runtime assets, not generated at runtime and not editable in the UI.

## Implementation Scope

- Add `assets/scholars/personas.json`, indexed by `scholarId`, with at least one complete persona card for end-to-end validation and useful cards for the existing real scholars where feasible.
- Add `assets/scholars/persona-distill-prompt.md` for offline generation guidance.
- Refactor LLM prompt assembly in `scripts/llm-client.js` into separate functions:
  - persona injection
  - knowledge boundary injection
  - conversation history injection
- Inject each scholar's patent evidence from existing `patents` data and public research direction from persona fields.
- Parse trailing `【依据】专利编号1, 专利编号2` from assistant replies, remove it from visible body, and render collapsible evidence cards below assistant messages.
- Evidence card collapsed label: `基于 N 条专利`.
- Expanded evidence item: title, publication number, scholar name, link to `patent-detail.html?id={patentId}`.
- Add optional development lint warning for persona `avoidPhrases` and `avoidTopics`; warnings only, no UX blocking.
- Keep the existing local simulated reply fallback when no LLM config exists.

## Acceptance Criteria

- `LlmClient.buildAdvisorMessages()` returns system prompt content with explicit persona, boundary, patent evidence, rejection templates, and no commercial-upgrade rejection language.
- Prompt assembly is split into independently testable functions.
- At least one persona card fully satisfies the schema and maps to an existing `inventorId`.
- Runtime can load persona cards for chat and pass them into real LLM calls.
- Assistant messages with trailing `【依据】...` render an evidence card and remove the raw marker from the message body.
- Assistant messages without evidence marker render no evidence card.
- Evidence links point to `patent-detail.html?id={patentId}` and use real catalog patents.
- Rejection template tests ensure the prompt forbids `购买`, `升级`, `顾问席位`, `对话许可` in rejection guidance.
- Existing tests still pass.

## Out Of Scope

- No embedding retrieval for scholar knowledge.
- No runtime persona distillation.
- No user-facing persona editor.
- No cross-scholar collaborative answer.
- No special refusal UI, purchase CTA, or human handoff after refusal.

## Verification

- Add/extend Node tests for persona schema, prompt assembly, evidence extraction/rendering, and LLM message construction.
- Run all `tests/*.test.mjs`.
- Browser-smoke `chat.html` with a synthetic evidence reply if practical.
