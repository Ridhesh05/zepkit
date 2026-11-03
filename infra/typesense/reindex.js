// Zero-downtime reindex logic, shared by scripts/reindex.js (CLI) and the admin "Run reindex" button.
// Rebuilds the index from MongoDB into a NEW physical collection, then atomically switches the
// `products` alias to it — live searches never see an empty or half-built index.
import { getDb, getTypesense, config, logger } from "@zepkit/common";
import { productsSchema, aliasTarget } from "./schema.js";

const ALIAS = config.typesense.collection;

function toDoc(p, inv) {
  const storeIds = inv.filter((i) => i.stock > 0).map((i) => i.storeId);
  const prices = inv.map((i) => i.price).filter((n) => typeof n === "number");
  const stock = inv.reduce((s, i) => s + (i.stock || 0), 0);
  return {
    id: p._id,
    title: p.title,
    tags: p.tags || [],
    aliases: p.aliases || [],
    category: p.category || "generic",
    veg: p.veg === true,
    price: prices.length ? Math.min(...prices) : 0,
    stock,
    store_ids: storeIds,
    ...(Array.isArray(p.vector) ? { embedding: p.vector } : {}),
  };
}

export async function runReindex() {
  const ts = getTypesense();
  const db = await getDb();

  const products = await db.collection("products").find().toArray();
  const inventory = await db.collection("inventory").find().toArray();
  const byProduct = {};
  for (const i of inventory) (byProduct[i.productId] ??= []).push(i);
  const docs = products.map((p) => toDoc(p, byProduct[p._id] || []));

  const newName = `${ALIAS}_${Date.now()}`;
  await ts.collections().create(productsSchema(newName));
  let imported = docs.length, failed = 0;
  if (docs.length) {
    const results = await ts.collections(newName).documents().import(docs, { action: "upsert", batch_size: 200 });
    failed = (Array.isArray(results) ? results : []).filter((r) => r && r.success === false).length;
    imported = docs.length - failed;
  }

  const prev = await aliasTarget();
  if (!prev) {
    let legacy = false;
    try { await ts.collections(ALIAS).retrieve(); legacy = true; } catch { /* none */ }
    if (legacy) await ts.collections(ALIAS).delete();
  }
  await ts.aliases().upsert(ALIAS, { collection_name: newName });

  const cleaned = [];
  const cols = await ts.collections().retrieve();
  for (const c of cols) {
    if (c.name !== newName && (c.name === ALIAS || c.name.startsWith(`${ALIAS}_`))) {
      await ts.collections(c.name).delete();
      cleaned.push(c.name);
    }
  }

  const result = { total: docs.length, imported, failed, newCollection: newName, previousCollection: prev, cleaned };
  logger.info(`reindex: ${imported}/${docs.length} → ${newName} (was: ${prev || "none"})`);
  return result;
}

// Snapshot for the admin "Index" tab: which collection the alias points at, and every physical
// collection that exists (so a dashboard can show "live" vs leftover).
export async function indexInfo() {
  const ts = getTypesense();
  const live = await aliasTarget();
  const cols = await ts.collections().retrieve();
  const ours = cols
    .filter((c) => c.name === ALIAS || c.name.startsWith(`${ALIAS}_`))
    .map((c) => ({ name: c.name, numDocuments: c.num_documents, live: c.name === live }));
  return { alias: ALIAS, live, collections: ours };
}

// Admin document browser — raw TypeSense query via the alias, no store scoping (unlike /search).
export async function browseDocuments({ q = "", limit = 20 } = {}) {
  const ts = getTypesense();
  const params = q.trim()
    ? { q, query_by: "title,tags,aliases", per_page: limit }
    : { q: "*", query_by: "title", sort_by: "stock:desc", per_page: limit };
  const res = await ts.collections(ALIAS).documents().search(params);
  return (res.hits ?? []).map((h) => h.document);
}
