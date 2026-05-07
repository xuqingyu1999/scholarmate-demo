# ScholarMate Mobile Visual Polish

## Summary
- Improve the current responsive mobile experience so it feels like a clear mobile business tool instead of a narrow desktop slice.
- Keep the existing static HTML/CSS/JS architecture and current business flow.
- Focus this pass on spacing, card rhythm, preview width, bottom navigation polish, and mobile readability.

## Acceptance Criteria
- Desktop `?mobile=1` preview uses a wider, calmer phone preview shell around 480px.
- Real 375px and 430px phone widths do not horizontally overflow.
- In desktop preview mode, bottom navigation links preserve `?mobile=1` across home, discover, demand, advisor, and profile destinations.
- Patent list cards are compact but not cramped; titles, price/free state, match reason, and advisor action remain readable.
- User center mobile layout keeps the horizontal menu and content panels visually separated.
- Chat mobile layout keeps the input usable and visually distinct from bottom navigation.
- Visual language stays simple, restrained, and businesslike.

## Verification
- Run existing Node behavior tests.
- Run `node --check` on core scripts.
- Parse inline HTML scripts.
- Run Playwright smoke for `?mobile=1` preview and 375px real mobile patent list/chat surfaces.
