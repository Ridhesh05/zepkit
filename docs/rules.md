# Engineering rules & conventions

## Work split
- **Claude writes the code** — services, handlers, moderation, search, tests.
- **You run it** — `docker compose up`, `.env`, start services, seed / eval / reindex.

## Stack
Node.js + Express (ESM) · Kafka (KRaft) · TypeSense · Redis · MongoDB · Ollama (`gemma3:4b` +
`bge-m3`). Monorepo via npm workspaces. Fresh build — not grafted onto V1/V2.

## Data ownership
- **MongoDB** = single source of truth. TypeSense & Redis rebuild from it (`reindex`).
- Product `_id` is created at the API, before Kafka. All three stores **upsert** on it → retries
  are idempotent.
- Worker commits the Kafka offset **only after** all three stores are written. 3 failures → DLQ.

## Kafka
- Topics: `products.ingest`, `products.ingest.dlq`. Events: product create/update/delete + stock.
- One worker service, four fan-out handlers (mongo, enrich, typesense, redis), one consumer group.
  Split into separate services only if one slow store starts blocking the others.

## Multilingual
Target: Hindi, English, Bengali, Marathi, Tamil, Telugu, Kannada, Odia, Gujarati, Rajasthani
(+ Punjabi, Malayalam, Assamese, Urdu in the KB). Two layers: `bge-m3` embeddings (semantic,
language-agnostic) + `tags`/`aliases` (exact keyword + typo, multi-script).

## Search
Hybrid = TypeSense BM25(name, tags, aliases) + vector(embedding), store-scoped by `store_ids`.
Redis caches results (`search:{hash(q,store)}`, 60s) and query vectors (`qvec`, 1h).

## Safety
See [content-safety.md](content-safety.md). All tag paths pass `guardTags()`; fail-closed; no
offensive content anywhere in the repo.
