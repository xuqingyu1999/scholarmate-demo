# Platform Feature Shortlist

## Scope
Research goal: identify a few convenient patterns from AI assistants and technology-transfer / patent platforms that fit ScholarMate's current static buyer-enterprise prototype without making the flow heavier.

## Evidence Snapshot
- AI chat products commonly make conversation history directly manageable: users expect to reopen, rename, pin, or delete conversations from the sidebar. This maps to the current workbench and chat session lists. References: [OpenAI ChatGPT help](https://help.openai.com/), [Anthropic Claude help center](https://support.anthropic.com/).
- Research assistants and grounded AI products make source visibility part of the answer or card experience. For ScholarMate, patent cards should show the public source and remind users that legal status still needs review. References: [Google NotebookLM help](https://support.google.com/notebooklm/), [Microsoft Copilot documentation](https://learn.microsoft.com/copilot/).
- Patent discovery tools use saved collections, workspaces, and traceable patent records to help teams resume diligence instead of searching from scratch every time. For this prototype, a lightweight "my digital scholars / licensed assets" shelf is the right first step. References: [PatSnap](https://www.patsnap.com/), [The Lens](https://www.lens.org/).
- Public technology-transfer discovery sites emphasize a clear path from opportunity to inquiry. ScholarMate should keep the first business action simple: search, view patent, buy/license access, talk to the matching digital scholar, then submit intent. Reference: [USPTO Patents 4 Partnerships](https://www.uspto.gov/ip-policy/patent-policy/patents-4-partnerships).

## Implemented Now
- Conversation history deletion in both the homepage advisor sidebar and the deep chat session list.
- Source/trust metadata on Google Patents-based demo patent cards and detail pages.
- Homepage digital scholar mode uses available advisor assets, so purchased licenses and joined advisor seats both participate.
- Larger medical/AI catalog to make search and advisor matching feel less empty in demos.

## Deferred
- Rename/pin chat history.
- Saved searches or watchlists.
- Exportable diligence notes.
- Formal technology-transfer checklist and transaction packet.
- Real backend ingestion of patent claims, PDFs, legal status, and assignee normalization.

