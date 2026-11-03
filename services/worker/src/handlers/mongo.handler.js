import { getDb } from "@zepkit/common";

// Upsert the catalog doc + per-store inventory. Mongo is the source of truth.
export async function writeMongo(p) {
  const db = await getDb();
  const now = new Date().toISOString();

  await db.collection("products").updateOne(
    { _id: p._id },
    {
      $set: {
        title: p.title,
        category: p.category ?? "generic",
        veg: p.veg ?? null,
        unit: p.unit ?? null,
        imageUrl: p.imageUrl ?? null,
        tags: p.tags,
        aliases: p.aliases,
        vector: p.vector,
        status: p.status,
        updatedAt: now,
      },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true },
  );

  for (const inv of p.inventory ?? []) {
    await db.collection("inventory").updateOne(
      { storeId: inv.storeId, productId: p._id },
      { $set: { stock: inv.stock, price: inv.price, updatedAt: now } },
      { upsert: true },
    );
  }
}

export async function deleteMongo(id) {
  const db = await getDb();
  await db.collection("products").deleteOne({ _id: id });
  await db.collection("inventory").deleteMany({ productId: id });
}
