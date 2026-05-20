# History Delete Platform Research Patent Expansion Brief

## Goal
Improve the minimal advisor workflow by adding conversation-history deletion, learning from comparable technology-transfer/AI products, and expanding the demo patent/digital scholar library with real medical-AI patent references.

## Locked Decisions
- Keep the current static frontend/localStorage prototype; do not introduce a production backend in this round.
- Conversation deletion should be user-visible and reversible only via browser/localStorage backups; no server-side recovery.
- Research findings should be converted into a small number of simple, enterprise-friendly workflow improvements, not a complex marketplace rebuild.
- Google Patents references should be used as public source metadata and demo inspiration; do not paste full patent texts into the app.
- Add around 10 medical/AI digital scholars and several real-reference medical/AI patents per scholar where practical, with source links for traceability.

## Research Artifact
- Shortlist: `docs/ai/research/2026-05-16-platform-feature-shortlist.md`

## Acceptance Criteria
- Homepage sidebar conversation history items can be deleted individually without breaking session restore.
- Chat page session list can delete sessions and updates the current view safely.
- Delete actions ask for confirmation and do not delete unrelated sessions.
- Research produces a short evidence-backed feature shortlist for the implementation.
- Patent catalog gains a noticeably larger medical/AI section with source identifiers/links and matching digital scholars.
- Search/recommendation can surface the newly added medical/AI patents for relevant queries.
- Existing workbench, chat-session, clickable-control, semantic-search, and catalog tests pass.
