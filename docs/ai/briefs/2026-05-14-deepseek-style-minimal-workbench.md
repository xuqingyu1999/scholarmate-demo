# DeepSeek Style Minimal Workbench Brief

## Goal
Turn ScholarMate into a minimal "科研之友" workbench with one screen, two modes, a collapsible sidebar, and one bottom input.

## Locked Decisions
- Keep old pages as internal carriers, but hide old primary entry points.
- Paid patent资料/对话许可 is required for the homepage digital scholar mode.
- Free shared patents do not count as purchased deep-chat licenses.
- Patent search from the homepage jumps to `patent-list.html?search=...`.
- Public-facing brand label is `科研之友`.

## Acceptance Criteria
- `index.html` shows only the minimal workbench: top bar, collapsible sidebar, central brand, two mode tabs, unified bottom input.
- The homepage has no visible `发布专利` entry.
- Patent mode search redirects to the existing search result page.
- Advisor mode blocks users with no paid purchased licenses and offers a "前往寻找专利" action.
- Advisor mode ranks only paid purchased licenses and shows at most 3 candidate digital scholars.
- Candidate cards can deep-link into `chat.html` with a prefilled `draft` query.
- `chat.html` supports `draft` without auto-sending the question.
- Sidebar shows account summary, paid purchased licenses, and conversation history only in advisor mode.
- Mobile homepage uses the same minimal workbench and does not inject the old bottom navigation.
- Existing core business, chat session, semantic search, and clickable-control tests continue to pass.

## Out Of Scope
- Do not physically delete old HTML files.
- Do not redesign the search result card body or patent detail commercial flow.
- Do not introduce a backend, real payment, or production LLM key handling.
