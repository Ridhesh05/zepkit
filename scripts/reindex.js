#!/usr/bin/env node
/**
 * Zero-downtime reindex (CLI). See infra/typesense/reindex.js for the logic — the same function
 * backs the "Run reindex" button on the admin Index tab.
 *   node scripts/reindex.js
 */
import { closeMongo, logger } from "@zepkit/common";
import { runReindex } from "../infra/typesense/reindex.js";

(async () => {
  const r = await runReindex();
  logger.info(`✅ alias → ${r.newCollection} (${r.imported}/${r.total} imported${r.failed ? `, ${r.failed} failed` : ""})`);
  if (r.cleaned.length) logger.info(`cleaned up: ${r.cleaned.join(", ")}`);
  await closeMongo();
  process.exit(0);
})().catch((e) => {
  logger.error("reindex failed:", e.message);
  process.exit(1);
});
