/**
 * guardTags() — the single moderation chokepoint. Every tag/alias (AI-generated, admin-typed, or
 * query→alias) passes through here before storage/indexing. See docs/content-safety.md.
 *
 * Model guardrail lives at generation time (the tag LLM prompt). This gate is the deterministic
 * final filter: it drops blocked substrings and, for veg products, any non-veg word. No slur list
 * is maintained here — abusive content is prevented by the generation prompt.
 */
import { isBlocked } from "./tagEngine.js";

// Non-veg words (+ common roman/Devanagari forms). Used only to enforce "veg product → no
// non-veg tag". Substring match.
const NONVEG = [
  "chicken", "murg", "mutton", "fish", "machli", "egg", "anda", "prawn", "jhinga", "meat", "gosht",
  "चिकन", "मुर्ग", "मटन", "मछली", "अंडा", "मांस", "झींगा",
];
const isNonVeg = (tag) => NONVEG.some((w) => tag.includes(w));

/**
 * @param {string[]} tags
 * @param {{ veg?: boolean|null }} opts  veg=true drops non-veg words; null/undefined = no veg rule
 * @returns {{ clean: string[], dropped: string[] }}
 */
export function guardTags(tags, { veg = null } = {}) {
  const clean = [];
  const dropped = [];
  for (const tag of tags) {
    const bad = isBlocked(tag) || (veg === true && isNonVeg(tag));
    (bad ? dropped : clean).push(tag);
  }
  return { clean, dropped };
}
