# ScholarMate Buyer Business Loop Brief

Date: 2026-04-30

## Goal

Implement the first buyer-side business loop for the static ScholarMate prototype:
buyer enterprise membership, enterprise verification, demand projects, patent recommendations,
AI inventor advisory chat, data/chat licenses, and trade intents.

## Locked Acceptance Criteria

- Unverified enterprise users can browse, favorite, and create basic demand projects.
- Buying membership, buying a patent data/chat license, or submitting a trade intent requires simulated enterprise verification.
- Simulated micro-deposit verification collects enterprise banking information, generates a deposit amount, and marks the user verified only after the correct amount is entered.
- Membership is buyer-side and project-centered, with three tiers: free verified, professional, and enterprise.
- Creating a demand project stores it locally and generates local rule-based patent recommendations with match reasons, risks, and next actions.
- AI inventor chat loads inventor, patent, and project context from URL/local state and answers as a practical technical commercialization advisor.
- Patent license means data/chat license only, not legal patent authorization.
- Verified enterprises can submit trade intents from the recommendation/detail/chat flow, and user center shows saved intents.
- Fix blocking bugs: duplicate `const inventor` in `chat.html`, bad `.class.remove(...)`, duplicate `main.js` include in `patent-publish.html`.

## Scope

This is a static prototype enhancement. Do not add a backend, real payment, real micro-deposit,
real AI API, document parsing, external patent data, or seller-side membership.

## Source Of Truth

The user-approved implementation plan in the conversation is the source of truth for behavior.
