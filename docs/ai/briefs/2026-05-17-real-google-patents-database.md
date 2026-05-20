# 2026-05-17 Real Google Patents Database

## Goal

Replace fake ScholarMate patent and digital scholar records with a scholar-first dataset built from real Google Patents records.

## Acceptance Criteria

1. Keep global contracts `inventors`, `patents`, `patentDetails`, and `getPatentById()`.
2. Use 10 real scholars/digital scholars, each with 2-3 patent assets, totaling 24-30 patents.
3. Every patent uses a Google Patents `sourceUrl`, a real publication number, lead inventor, assignee, legal status, date metadata, summary, field, industry, and at least one Google image or PDF URL.
4. Every scholar affiliation comes from real assignee/institution metadata, with no fabricated portraits.
5. Pricing is derived by rules: 3999 for top university/national institute plus active/highly relevant records, 2999 for research institute/strong company/university records, 1999 for older/narrower records, and 0 for selected trial/open discovery records.
6. Patent list, detail, chat, user center, and workbench render from the canonical catalog.
7. Remove fake `ZL2024...` records, DiceBear portraits, Picsum patent images, and hardcoded fake licensed/favorite cards from the core experience.
8. UI shows a Google Patents legal/status caveat and does not imply verified legal clearance.
9. Tests assert source metadata, scholar-patent cardinality, derived pricing, real image/PDF source availability, and updated recommendation IDs.

## Dataset Scope

Scholar-first seed:

- 李传富，合肥综合性国家科学中心人工智能研究院，medical imaging AI.
- 汤进，合肥综合性国家科学中心人工智能研究院，medical report NLP.
- 程勇，WeBank Co Ltd，federated learning and privacy computing.
- 冯旭宁，Tsinghua University，battery thermal runaway.
- 王昱，Tsinghua University，battery safety evaluation and suppression.
- 刘妹琴，Zhejiang University，industrial vision defect detection.
- 康重庆，Tsinghua University，power carbon accounting and low-carbon dispatch.
- 常虹，Plant Protection Research Institute Guangdong Academy of Agricultural Sciences，agricultural pest warning.
- 吕华，Peking University，protein-polyamino acid conjugates and biomedical materials.
- 王潇楠，Plant Protection Research Institute Guangdong Academy of Agricultural Sciences，plant-protection UAV spraying.

## Verification Plan

- Update catalog tests first so fake data fails.
- Replace static fake cards with catalog-driven rendering.
- Run every `tests/*.test.mjs`.
- Start a local static server and manually verify `index.html`, `patent-list.html`, `patent-detail.html`, `chat.html`, and `user-center.html`.
