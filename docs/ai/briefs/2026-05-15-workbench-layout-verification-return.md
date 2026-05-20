# Workbench Layout And Verification Return Brief

## Goal
Fix the minimal homepage layout and enterprise verification return flow without changing the broader business model or user-center design.

## Locked Decisions
- Sidebar collapsed state must not compress the main workbench; the main area should use the full viewport width.
- Desktop input bar should align with the visible workbench center: right-side main area center when sidebar is open, full viewport center when collapsed.
- Desktop input bar should be longer and slightly higher than the current fixed bottom position.
- Homepage sidebar should show a clear enterprise verification CTA for unverified or not-yet-logged-in users.
- Verification CTA target is `user-center.html?return=index.html#enterprise-verification`.
- Successful enterprise verification returns to `index.html`; failed amount checks stay on the verification page.

## Acceptance Criteria
- At 1440px desktop width, sidebar open: mode tabs and input bar share the same center point in the main content area.
- At 1440px desktop width, sidebar collapsed: mode tabs remain full width and centered with the input bar in the full viewport.
- Input bar width is approximately 880px on desktop and still responsive below that width.
- Unverified users see `请先去企业认证` in the homepage sidebar; verified users do not.
- Correct simulated deposit amount redirects to the sanitized return URL, defaulting to `index.html`.
- Existing workbench, clickable controls, and relevant business tests continue to pass.
