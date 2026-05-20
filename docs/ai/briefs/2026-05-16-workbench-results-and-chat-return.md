# Workbench Results And Chat Return Brief

## Goal
Make the minimal homepage and digital scholar chat flow feel usable for enterprise users after asking a question.

## Locked Decisions
- Homepage advisor results should not push the whole workbench downward or become inaccessible.
- Homepage result cards and the sidebar must be scrollable when content exceeds the viewport.
- Entering a one-to-one digital scholar chat from the homepage must provide a convenient return path to the homepage advisor results for the same question.
- Chat should still provide a clear route to the patent detail page.
- Keep the existing static frontend and localStorage/session model; do not add a backend.

## Acceptance Criteria
- After asking in homepage advisor mode, the mode tabs stay visible near the top of the workbench, candidate cards are visible above the input bar, and result content can scroll.
- Sidebar body scrolls independently when account/assets/history content exceeds viewport height.
- `chat.html` opened with a `draft` question shows both `返回首页` and `查看专利详情` actions.
- `返回首页` opens `index.html` in advisor mode, restores the question in the input, and re-renders the top digital scholar candidates.
- Users can edit the restored question and submit again from the homepage.
- Existing workbench, chat-session, clickable-control, and mobile smoke tests continue to pass.
