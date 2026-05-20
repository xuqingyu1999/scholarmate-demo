# Vercel chat and patent image debug

## Context

After deploying `xuqingyu1999/scholarmate-demo` to Vercel, the chat UI reports that the server advisor is temporarily unavailable. The deployed API endpoint returns a Vercel function invocation failure rather than the app's normal JSON error payload. Patent image files are present online, but the UI may still show text/PDF fallbacks for low-quality local images.

## Acceptance Criteria

- The repository declares the Node module runtime needed by the ESM serverless handler.
- A regression test fails when the deployment module config is missing.
- Existing API/chat, catalog, persona, and static source tests still pass.
- The fix is committed and pushed to `main`.
- The user gets clear Vercel env guidance and an explanation of the patent image behavior.

## Notes

- Local direct OpenAI calls from the current machine return a region support error, so local success criteria cannot require an actual assistant response from OpenAI.
- Online image assets such as `assets/patents/CN104346524A.png` return HTTP 200 from Vercel.
