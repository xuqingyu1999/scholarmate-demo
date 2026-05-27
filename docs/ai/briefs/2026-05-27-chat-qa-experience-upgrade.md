# Chat QA experience upgrade

## Summary
Upgrade the digital scholar chat experience into a focused chat surface with safer rich answer rendering, professor-style structured answers, and higher paid membership daily token limits.

## Acceptance Criteria
- AI replies support safe lightweight Markdown for bold text, paragraphs, bullet lists, numbered lists, and line breaks.
- User messages remain plain escaped text.
- Advisor prompts ask for Chinese, professor-style structured answers with sections for core judgment, evidence, conditions, risk boundary, and next step.
- Local fallback replies use the same professor-style section structure.
- Chat layout follows the focused chat stage direction: narrow scholar rail, wide central chat, no permanently required right column.
- Composer starts larger than the current single-line input and expands up to about 220px.
- Membership limits are free 100, professional 1000, enterprise 5000, with UI and tests aligned.

## Defaults
- Keep `/api/chat` payload shape unchanged.
- Keep the existing 30 token cost per message.
- Do not reintroduce browser API key configuration.
