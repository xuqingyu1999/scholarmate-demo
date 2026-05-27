# Chat Internal Scroll Shell

## Goal
Make `chat.html` behave like a focused LLM chat shell: the page stays locked to the viewport while only the message list scrolls internally.

## Acceptance Criteria
- `body.chat-page`, the chat page main container, `.chat-layout`, and `.chat-main` form a fixed-height `100dvh` layout chain.
- `.chat-messages` is the primary scroll container with `overflow-y: auto`, `min-height: 0`, `scrollbar-gutter: stable`, and thin scrollbar styling.
- `.chat-context-panel` stays outside `.chat-messages`, above the message list, so expanded context compresses messages instead of growing the whole page.
- `.chat-input-area` remains inside `.chat-main` at the bottom of the shell on desktop and mobile.
- Mobile chat keeps the existing hidden scholar sidebar behavior but does not use page-level fixed or sticky input overlays.
- No changes to `/api/chat`, prompts, quotas, or message data structures.

## Verification Plan
- Update `tests/chat-experience-upgrade.test.mjs` to assert the fixed-height chain, internal message scroller, context placement, and mobile input behavior.
- Run the updated chat experience test and the full `tests/*.test.mjs` suite.
- Use Playwright against a local server to inject many messages and verify page scroll height stays close to the viewport while `.chat-messages` overflows internally.
