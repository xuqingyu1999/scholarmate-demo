# Advisor Assets Workbench Brief

## Goal
Update the minimal homepage advisor mode so it uses all available digital scholar assets, not only paid patent licenses.

## Locked Decisions
- Available digital scholars come from paid purchased资料/对话许可 and joined advisor seats.
- Free shared patents do not become homepage advisor candidates merely because they appear in `purchasedLicenses`.
- A free shared patent can become a homepage advisor candidate when its inventor/patent has been joined as an advisor seat.
- Duplicate assets for the same patent are merged and show combined sources.
- Keep the current static frontend and localStorage simulation.

## Acceptance Criteria
- Homepage sidebar title changes from `已购许可` to `我的数字学者`.
- Sidebar lists both paid-license scholars and joined-seat scholars.
- Advisor mode can answer from a joined free-shared scholar seat.
- Advisor mode still blocks a user who only has a free shared patent in `purchasedLicenses`.
- Top 3 advisor cards rank across the combined advisor asset pool.
- Chat links continue to use `draft` without auto-sending.
