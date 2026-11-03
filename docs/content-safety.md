# Content safety

My responsibility: no abusive, sexual, offensive, or communal word ever reaches `tags` or
`aliases`, in any language or spelling. Approach is **model + rules, never a hand-maintained
slur list**.

## The hard rules

1. **Guard every entry point.** AI-generated, admin-typed, and user-query→alias all pass through
   `guardTags()` before storage/indexing. No bypass.
2. **Prompt guardrail.** The tag LLM is explicitly instructed never to output abusive / vulgar /
   sexual / offensive / communal words, and to drop anything it is unsure about.
3. **Fail-closed.** If Ollama is down or times out, a tag is **not** added — it stays `pending`
   and is retried. We never store what we could not verify.
4. **Veg / non-veg.** A veg product never receives a non-veg tag (dietary + religious correctness).
   Enforced by the `BLOCKED` substring list (beef/pork etc.) and conflict rules.
5. **Legit-but-sensitive products stay.** Items like sanitary pads remain listed and findable;
   only their tag vocabulary is kept neutral/clinical — never slang.
6. **Clean repo.** No offensive example appears anywhere — code, KB, prompts, docs, or tests.
   Moderation tests use neutral placeholders and mocked model responses, and verify the
   *mechanism* (flagged → dropped, fail-closed → pending), never real slurs.

## Where it lives
`services/ai-service/src/guardTags.js` is the single owner. One place, one rule, easy to audit.
