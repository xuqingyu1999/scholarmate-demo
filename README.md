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

## Prototype Notes

- No backend, database, real payment, real enterprise verification, or legal patent authorization is connected.
- Demo state is stored in the visitor browser via `localStorage`.
- Optional LLM configuration is stored only in `sessionStorage`.
- Semantic search can load a browser-side model remotely; if unavailable, local rule ranking is used.
