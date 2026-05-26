# 2026-05-23 CityU Digital Scholar Cleanup

## Goal

Consolidate ScholarMate around the CityU patent catalog and make the digital scholar experience consistent, evidence-bounded, and safe to run locally.

## Acceptance Criteria

- Runtime catalog uses 9 CityU digital scholars and 16 CityU patent records from `scripts/main.js`.
- `assets/scholars/personas.json` is keyed by the same CityU scholar IDs used by `inventors`.
- Persona cards describe style and boundaries only; patent and paper facts stay in `patentMemory`, `paperMemory`, and `knowledgeIndex`.
- Browser chat no longer asks users to enter LLM `baseURL`, `API key`, or `model`.
- Local static usage relies on deterministic local fallback; deployed usage calls `/api/chat`.
- `/api/chat` reconstructs trusted CityU scholar/patent context server-side.
- Tests cover CityU catalog integrity, persona alignment, chat evidence, serverless payload behavior, and simplified chat UI.
- Git status is readable, with OneDrive backup files and scratch output left untracked or excluded from staging.

## Scope

This task does not add new CityU patents or new scholar evidence. It normalizes the current CityU dataset, chat interface, tests, and Git state around the dataset already synced into the workspace.
