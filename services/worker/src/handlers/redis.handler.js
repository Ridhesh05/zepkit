import { getRedis } from "@zepkit/common";

// Warm the hot cache: product info (+vector) and per-store stock/price.
export async function writeRedis(p) {
  const redis = getRedis();
  const pipe = redis.pipeline();
  pipe.set(
    `product:${p._id}`,
    JSON.stringify({
      title: p.title,
      category: p.category ?? "generic",
      veg: p.veg ?? null,
      tags: p.tags ?? [],
      aliases: p.aliases ?? [],
      vector: p.vector ?? null,
    }),
  );
  for (const inv of p.inventory ?? []) {
    pipe.set(`store:${inv.storeId}:product:${p._id}`, JSON.stringify({ stock: inv.stock, price: inv.price }));
  }
  await pipe.exec();
}

export async function deleteRedis(id, storeIds = []) {
  const redis = getRedis();
  const keys = [`product:${id}`, ...storeIds.map((s) => `store:${s}:product:${id}`)];
  if (keys.length) await redis.del(...keys);
}
