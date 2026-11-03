import { getTypesense, config } from "@zepkit/common";

// Upsert the search doc. store_ids = stores where in stock → enables store-scoped search.
export async function writeTypesense(p) {
  const inv = p.inventory ?? [];
  const storeIds = inv.filter((i) => i.stock > 0).map((i) => i.storeId);
  const prices = inv.map((i) => i.price).filter((n) => typeof n === "number");
  const stock = inv.reduce((s, i) => s + (i.stock || 0), 0);

  const doc = {
    id: p._id,
    title: p.title,
    tags: p.tags ?? [],
    aliases: p.aliases ?? [],
    category: p.category ?? "generic",
    veg: p.veg === true,
    price: prices.length ? Math.min(...prices) : 0,
    stock,
    store_ids: storeIds,
    ...(Array.isArray(p.vector) ? { embedding: p.vector } : {}),
  };

  await getTypesense().collections(config.typesense.collection).documents().upsert(doc);
}

export async function deleteTypesense(id) {
  try {
    await getTypesense().collections(config.typesense.collection).documents(id).delete();
  } catch {
    /* already gone */
  }
}
