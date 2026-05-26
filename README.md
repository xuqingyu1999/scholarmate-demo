# ScholarMate

ScholarMate is a static frontend prototype for a buyer-enterprise patent discovery and digital advisor workflow.

## Run Locally

```bash
python -m http.server 8123
```

Open:

```text
http://127.0.0.1:8123/index.html
```

Mobile preview:

```text
http://127.0.0.1:8123/index.html?mobile=1
```

## GitHub Pages

This repository is ready for GitHub Pages:

- `index.html` is the site entry.
- `.nojekyll` is included.
- `.github/workflows/pages.yml` deploys the static site when pushed to `main`.

Deployment steps are in:

```text
docs/github-pages-deployment.md
```

## Product Docs

- Product and business model: `docs/scholarmate-product-business-model.md`
- Word version: `docs/ScholarMate-product-business-model.docx`
- User guide and business flow: `docs/scholarmate-user-guide-business-flow.md`

## Prototype Notes

- No database, real payment, real enterprise verification, or legal patent authorization is connected.
- Demo state is stored in the visitor browser via `localStorage`.
- Local static usage does not run a real LLM chat. The chat page falls back to deterministic local advisor replies when `/api/chat` is unavailable.
- Deployed LLM chat uses the serverless `/api/chat` proxy with `OPENAI_API_KEY`, `OPENAI_MODEL`, optional `OPENAI_BASE_URL`, and optional `CHAT_API_TOKEN` environment variables.
- Semantic search can load a browser-side model remotely; if unavailable, local rule ranking is used.
