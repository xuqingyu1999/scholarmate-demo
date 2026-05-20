# Persona Distillation Prompt (Offline Only)

Use this template offline to draft or revise scholar persona cards in `assets/scholars/personas.json`.
Do not run this prompt in production runtime.

## Inputs
- Scholar profile: name, affiliation, expertise
- Patent set: core patent ids, titles, summaries, keywords
- Public research directions from reliable public records

## Output JSON schema (single scholar card)
```json
{
  "scholarId": "inv_001",
  "name": "Scholar Name",
  "title": "Short role title",
  "researchStyle": "engineering",
  "coreTopics": ["topic 1", "topic 2", "topic 3"],
  "adjacentTopics": ["topic 1", "topic 2", "topic 3"],
  "outOfScope": ["topic 1", "topic 2", "topic 3"],
  "tone": "产业务实",
  "verbosity": "medium",
  "metaphorStyle": "occasional",
  "signaturePhrases": ["phrase 1", "phrase 2"],
  "avoidTopics": ["topic 1", "topic 2"],
  "avoidPhrases": ["phrase 1", "phrase 2", "phrase 3"],
  "rejectionTemplates": {
    "outOfField": "...",
    "inFieldButUntouched": "...",
    "beyondPublic": "..."
  },
  "corePatentIds": ["CNxxxx"]
}
```

## Constraints
- Keep descriptions neutral and evidence-oriented.
- Avoid personal, medical, legal, or financial guarantees.
- Keep `avoidPhrases` and `avoidTopics` concrete for dev lint checks.
- `corePatentIds` is optional helper field, but when present it must map to existing ids in `scripts/main.js` patent catalog.