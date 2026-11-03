import { randomUUID } from "node:crypto";

export const EventType = {
  ProductCreated: "product.created",
  ProductUpdated: "product.updated",
  ProductDeleted: "product.deleted",
  StockUpdated: "stock.updated",
};

/**
 * Build a Kafka event envelope. `eventId` is the idempotency key; stores upsert on payload._id.
 */
export function makeEvent(eventType, payload) {
  return { eventType, eventId: randomUUID(), timestamp: new Date().toISOString(), payload };
}
