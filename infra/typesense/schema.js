import { getTypesense, config, logger } from "@zepkit/common";

// The app always talks to this name. It is a TypeSense ALIAS pointing at a versioned physical
// collection (products_<ts>), so a reindex can swap the alias atomically = zero downtime.
const ALIAS = config.typesense.collection;

export function productsSchema(name) {
  return {
    name,
    fields: [
      { name: "title", type: "string" },
      { name: "tags", type: "string[]" },
      { name: "aliases", type: "string[]" },
      { name: "category", type: "string", facet: true },
      { name: "veg", type: "bool", facet: true },
      { name: "price", type: "float", facet: true },
      { name: "stock", type: "int32", facet: true },
      { name: "store_ids", type: "string[]", facet: true },
      { name: "embedding", type: "float[]", num_dim: config.ollama.embedDim, optional: true },
    ],
    default_sorting_field: "stock",
  };
}

// What physical collection the alias currently points at (null if no alias).
export async function aliasTarget() {
  try {
    return (await getTypesense().aliases(ALIAS).retrieve()).collection_name;
  } catch {
    return null;
  }
}

// Create the alias + a fresh physical collection if neither exists. Idempotent.
export async function ensureCollection() {
  const ts = getTypesense();
  if (await aliasTarget()) {
    logger.info(`TypeSense alias "${ALIAS}" already set`);
    return;
  }
  // a legacy physical collection literally named like the alias?
  let legacy = false;
  try { await ts.collections(ALIAS).retrieve(); legacy = true; } catch { /* none */ }
  if (legacy) {
    logger.info(`legacy collection "${ALIAS}" exists — run "node scripts/reindex.js" to move it behind an alias`);
    return;
  }
  const name = `${ALIAS}_${Date.now()}`;
  await ts.collections().create(productsSchema(name));
  await ts.aliases().upsert(ALIAS, { collection_name: name });
  logger.info(`created ${name} + alias ${ALIAS} → ${name}`);
}

// Drop everything (alias + all physical collections) and recreate fresh. Used by the seed.
export async function resetCollection() {
  const ts = getTypesense();
  try { await ts.aliases(ALIAS).delete(); } catch { /* none */ }
  const { collections } = { collections: await ts.collections().retrieve() };
  for (const c of collections) {
    if (c.name === ALIAS || c.name.startsWith(`${ALIAS}_`)) {
      try { await ts.collections(c.name).delete(); } catch { /* ignore */ }
    }
  }
  await ensureCollection();
}
