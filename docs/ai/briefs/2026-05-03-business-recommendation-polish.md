# ScholarMate Business And Recommendation Polish Brief

Date: 2026-05-03

## Goal

Implement the second buyer-side iteration: stronger membership purchase CTAs, free-shared patent pricing,
low annual data/chat license pricing, stricter human appointment gates, and natural-language
recommendation/search using a browser-local Hugging Face Transformers.js embedding path with rule fallback.

## Locked Acceptance Criteria

- User center and chat page show obvious membership/upgrade entry points.
- Patents without list prices are treated as free-shared patents; their detail page does not show a total transfer price.
- Paid patents show data/chat license annual prices of 1999, 2999, or 3999 CNY per year.
- Appointment booking requires enterprise verification and either professional/enterprise membership or a purchased current paid-patent data/chat license.
- Recommendation/search supports a hybrid score using semantic similarity, field matching, and business-rule boosts.
- Browser semantic search module lazy-loads Transformers.js with `Xenova/multilingual-e5-small`, caches patent embeddings, and falls back without blocking if loading fails.
- Natural-language queries rank the intended patent first for medical imaging, battery thermal safety, and blockchain privacy examples.
- HTML/script injection text does not execute.

## Scope

No OpenAI API key, no paid external API, no production backend, no real payment, no real contract authorization, no real customer-service scheduling.
