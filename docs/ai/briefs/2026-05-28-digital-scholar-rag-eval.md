# Digital Scholar RAG And QA Evaluation

## Goal
Upgrade the CityU digital scholar chat from prompt-stuffed catalog context to a verifiable RAG flow shared by the serverless LLM path and local fallback. Add a reproducible QA evaluation harness so answer quality can be tested against retrieval, citation, faithfulness, relevance, and boundary behavior.

## Scope
- Add one deterministic lexical evidence retriever with evidence types: `patent`, `paper_pdf`, `paper_metadata`, and `collab_playbook`.
- Use the retriever in `/api/chat`, LLM prompt construction, and local fallback advisor replies.
- Load trusted server-side assets only: CityU inventor, patent, persona, scholar knowledge indexes, paper manifests, and offline university-industry collaboration playbook entries.
- Add "Retrieved Evidence Packets" to the prompt with stable citation keys, source type, title, source URL/file/page, snippet, and metadata-only flags.
- Keep `/api/chat` request and response structure unchanged. Do not add frontend API key or UI data shape changes.
- Add a 36-question semi-automatic gold set and a dry-run evaluator for baseline vs RAG experiments.

## Acceptance Criteria
- RAG retrieval is deterministic, pure-function friendly, and does not call embedding or remote APIs.
- Each chat request can retrieve at most: current patent 1, same-scholar patents 3, paper/PDF chunks 5, and collaboration playbook 3.
- Technical and patent facts prioritize CityU patent and paper evidence. `collab_playbook` evidence is clearly bounded as generic university technology-transfer practice, not CityU official policy, contract terms, legal advice, or commercial promises.
- Metadata-only paper records are labeled as metadata-only and cannot be treated as full-text evidence.
- `/api/chat` still rejects client-supplied `messages`, `inventor`, `patent`, `persona`, `patents`, and `knowledgePatents`.
- Local fallback and real LLM prompt use the same retrieved evidence selection path.
- The evaluation set has exactly 36 cases with required fields: `id`, `inventorId`, `patentId`, `question`, `category`, `expectedBehavior`, `qrels`, `requiredClaims`, `forbiddenClaims`, and `acceptableBoundaryLanguage`.
- Dry-run evaluator reports Recall@5, MRR@5, nDCG@5, context relevance/noise, required-claim recall, forbidden-claim count, section compliance, citation recall/precision/invalid citations, and boundary precision/recall/over-refusal.
- Full `tests/*.test.mjs` passes before commit.

## Out Of Scope
- No vector database.
- No new paid model or embedding call.
- No membership, chat layout, or frontend API key changes.
- No committed live experiment output under `output/evals/`.

## Test Plan
- Add retriever tests for patent, paper PDF chunk, paper metadata-only, and collaboration playbook evidence.
- Extend API tests to prove server-side trusted RAG context is rebuilt and prompt packets are present.
- Extend prompt tests for citation rules, metadata-only boundaries, and non-CityU playbook boundaries.
- Add fallback test proving `business-core` can consume the same retriever.
- Add eval tests for the 36-case fixture, metric calculations, and mock dry-run report format.
- Run all tests with PowerShell loop over `tests/*.test.mjs`.
