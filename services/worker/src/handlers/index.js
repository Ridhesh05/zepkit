import { EventType } from "@zepkit/common";
import { enrich } from "./enrich.handler.js";
import { writeMongo, deleteMongo } from "./mongo.handler.js";
import { writeTypesense, deleteTypesense } from "./typesense.handler.js";
import { writeRedis, deleteRedis } from "./redis.handler.js";

// Fan out one event to all three stores. Throws on any failure (consumer retries → DLQ).
export async function handle(event) {
  const { eventType, payload } = event;

  if (eventType === EventType.ProductDeleted) {
    await deleteTypesense(payload._id);
    await deleteRedis(payload._id, (payload.inventory ?? []).map((i) => i.storeId));
    await deleteMongo(payload._id);
    return;
  }

  // created / updated / stock — enrich then write everywhere (Mongo is written last? no: truth first)
  const enriched = await enrich(payload);
  await writeMongo(enriched); // source of truth
  await writeTypesense(enriched); // search index
  await writeRedis(enriched); // hot cache
}
