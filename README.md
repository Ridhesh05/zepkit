# ZepKit — Multilingual Semantic Search

A Blinkit-style search system where a query in **any language or phrasing** finds the
right product — search `potato`, `आलू`, or `aloo` and all hit the same item.

## How it works

- **Semantic vectors** (BGE-M3, via Ollama) place `potato` and `आलू` near each other, so
  matches cross language boundaries.
- **Hybrid search** in TypeSense combines keyword (BM25 + typo tolerance) with vector search.
- **Gemma 3** (via Ollama) auto-suggests multilingual tags when an admin adds a product.

## Architecture

```
Admin/Search UI ─► API Gateway ─► Kafka (product.events) ─► Worker consumers:
                                                              • MongoDB   (source of truth)
                                                              • Enrichment (BGE-M3 embeddings)
                                                              • TypeSense (fields + vector)
                                                              • Redis      (hot cache)
```

| Store      | Role                                                        |
|------------|-------------------------------------------------------------|
| MongoDB    | Single source of truth; other stores rebuild from it        |
| TypeSense  | Search engine — hybrid keyword + vector, facets, typo tol.  |
| Redis      | Hot cache — popular products, cached queries & embeddings   |
| Kafka      | Ingestion backbone — decouples write API from the 3 stores  |

## Stack

Node.js + Express · Kafka (KRaft) · TypeSense · Redis · MongoDB · Ollama (gemma3 + bge-m3)

## Quick start

```bash
cp .env.example .env
npm install
npm run infra:up        # Kafka, TypeSense, Redis, MongoDB (Docker)
ollama pull bge-m3      # multilingual embeddings (gemma3 already installed)
```

## Layout

```
services/ai-service/    # Ollama wrapper: tag suggestion + embeddings
services/api-gateway/   # product CRUD + /search
services/worker/        # Kafka consumers (Mongo, enrich, index, cache)
packages/common/        # shared config + event contracts
web/                    # admin + search UI (pending UI reference)
```

## Roadmap

- [x] Phase 0 — infra + skeleton
- [ ] Phase 1 — AI service (tags + embeddings)
- [ ] Phase 2 — write path (API → Kafka → stores)
- [ ] Phase 3 — hybrid search + Redis cache
- [ ] Phase 4 — admin + search UI
- [ ] Phase 5 — hardening (DLQ, reindex job, idempotency)
```
