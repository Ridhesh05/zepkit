#!/usr/bin/env node
// One-time setup: create Kafka topics + TypeSense collection. Safe to re-run (idempotent).
import { ensureTopics } from "../infra/kafka/topics.js";
import { ensureCollection } from "../infra/typesense/schema.js";
import { logger } from "@zepkit/common";

(async () => {
  await ensureTopics();
  await ensureCollection();
  logger.info("bootstrap complete");
  process.exit(0);
})().catch((e) => {
  logger.error("bootstrap failed:", e.message);
  process.exit(1);
});
