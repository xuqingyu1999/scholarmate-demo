# ScholarMate Demand Upload Recommendation Quality

## Summary
- Add a demand text upload path under patent-list search that creates a buyer demand project and recommends patents from that richer context.
- Support paste, `.txt`, and `.md` only in v1; Word/PDF are out of scope.
- Fix fallback recommendation quality so unrelated free patents are not promoted when semantic embeddings are unavailable.

## Acceptance Criteria
- Keyword search remains lightweight browsing and displays only relevant Top 5 results.
- Upload/paste demand text creates a `scholarmate_demand_projects` project and shows demand-based Top 5 recommendations on the patent list page.
- Demand text parsing infers title, industry, stage, summary, and preserves sanitized text up to 5000 characters.
- Searching `人工智能与医疗` ranks the AI medical diagnosis patent first and does not include unrelated free patents solely due to commercial boost.
- Uploaded text containing HTML/script is displayed as text only.
- Mobile preview links preserve `?mobile=1` when navigating from generated recommendation actions.

## Verification
- Add failing tests before implementation for recommendation quality and demand text parsing.
- Run all existing Node tests.
- Run `node --check` on core scripts and parse inline HTML scripts.
- Run browser smoke covering upload/paste demand creation, recommendation display, and mobile preview preservation.
