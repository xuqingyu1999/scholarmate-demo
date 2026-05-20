# UI simplification and digital scholar trust

## Context

The chat page is visually noisy because membership, token, seat, session, quick question, and transaction controls all compete with the main scholar conversation. The patent list page also places demand upload in the first screen, which interrupts browsing. This task implements the approved NotebookLM-style simplification plan.

## Acceptance Criteria

- Chat uses a light three-column layout: scholar/session, focused chat, and trust/source panel.
- Patent list no longer exposes the demand upload block.
- Commercial conversion actions are not placed in the chat main path.
- Evidence cards, quick questions, local fallback, and sessions keep working.
- Full `tests/*.test.mjs` passes and browser checks cover chat and patent list pages.
