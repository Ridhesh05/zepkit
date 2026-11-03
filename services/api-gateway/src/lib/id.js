import { randomUUID } from "node:crypto";

// Product id is created here, at the API, before Kafka. All stores upsert on it → retry-safe.
export const makeProductId = () => `prd_${randomUUID().replace(/-/g, "").slice(0, 20)}`;
