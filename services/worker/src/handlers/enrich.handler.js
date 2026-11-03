import { logger } from "@zepkit/common";
import { embed, suggestTags } from "../lib/aiClient.js";

/**
 * Ensure tags/aliases + vector. Fail-closed: if the AI service is unreachable, we do NOT invent
 * data — tags stay as-is and the product is marked `pending` so the worker/DLQ retries later.
 */
export async function enrich(product) {
  let { tags = [], aliases = [], category, veg } = product;
  let pending = false;

  if (tags.length === 0 && aliases.length === 0) {
    try {
      const s = await suggestTags(product.title, veg);
      tags = s.tags;
      aliases = s.aliases;
    } catch (e) {
      logger.warn(`enrich: tag service failed (${e.message}) → pending`);
      pending = true;
    }
  }

  let vector = null;
  const text = [product.title, ...tags, ...aliases, category].filter(Boolean).join(" ");
  try {
    vector = await embed(text);
  } catch (e) {
    logger.warn(`enrich: embed failed (${e.message}) → pending`);
    pending = true;
  }

  return { ...product, tags, aliases, vector, status: pending ? "pending" : "live" };
}
