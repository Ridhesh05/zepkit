/**
 * Recipe/intent detection — rule-first (KB), LLM-fallback for novel dishes, same philosophy as
 * tagEngine.js: a cheap dictionary pass handles the common case; the LLM only runs for queries that
 * look like a recipe intent but aren't in the KB, and it fails closed (never guesses).
 */
import fs from "node:fs";
import { createHash } from "node:crypto";
import { getRedis } from "@zepkit/common";
import { normalize, fuzzyFind } from "./tagEngine.js";
import { chat } from "./lib/ollama.js";
import { guardTags } from "./guardTags.js";

const KB = JSON.parse(fs.readFileSync(new URL("./kb/recipe-kb.json", import.meta.url), "utf8")).dishes;

const has = (text, term) => ` ${text} `.includes(` ${term} `);
const hash = (s) => createHash("sha1").update(s).digest("hex").slice(0, 16);

// Hinglish/English phrases that signal "I want to cook/make this" — gates the LLM-fallback tier.
const TRIGGER = /\b(banana hai|banani hai|bana hai|banau|banaun|banaye|bnani hai|bana do|kaise banau|kaise banaye|kaise bnaye|how (?:do i|to) make|recipe (?:of|for)|banane ka tarika)\b/i;

const dishNameTypos = (t) => (t.length >= 9 ? 2 : t.length >= 6 ? 1 : 0);

function kbMatch(text) {
  for (const dish of Object.values(KB)) {
    const names = dish.names.map(normalize);
    if (names.some((n) => has(text, n))) return dish;
    if (fuzzyFind(text, names, dishNameTypos)) return dish;
  }
  return null;
}

const STR = { type: "string" };
const SCHEMA = {
  type: "object",
  properties: {
    is_recipe: { type: "boolean" },
    dish: STR,
    ingredients: { type: "array", items: STR },
  },
  required: ["is_recipe", "dish", "ingredients"],
};
const SYSTEM = `You are a cooking assistant for an Indian quick-commerce grocery app.
Given a short phrase, decide if it names a real, recognizable VEGETARIAN dish someone wants to cook.
If yes: is_recipe=true, dish=clean dish name, ingredients=4-6 generic grocery product-type words in
English (no brand, no quantity, no sizes, no preparation verbs), ordered by importance.
If the dish is non-vegetarian (meat, fish, egg, etc.), or unsure, or it is not a real dish: return
is_recipe=false, dish="", ingredients=[].
STRICT: never output abusive, vulgar, sexual, offensive or communal words. Never guess if unsure.`;

async function llmFallback(dishText) {
  try {
    const raw = await chat(
      [
        { role: "system", content: SYSTEM },
        { role: "user", content: `Phrase: "${dishText}"` },
      ],
      { format: SCHEMA, options: { temperature: 0.1, num_predict: 200 }, timeoutMs: 15000 },
    );
    const out = JSON.parse(raw || "{}");
    if (!out.is_recipe) return { isRecipe: false };
    const ingredients = (out.ingredients || [])
      .filter((t) => typeof t === "string")
      .map(normalize)
      .filter(Boolean);
    const { clean } = guardTags(ingredients, { veg: true }); // defensive second layer (veg-only policy)
    if (clean.length === 0) return { isRecipe: false };
    return { isRecipe: true, dish: normalize(out.dish || dishText), ingredients: clean.slice(0, 6), source: "llm" };
  } catch (e) {
    // fail-closed: Ollama down/timeout/bad JSON → never guess, caller falls through to normal search.
    return { isRecipe: false, source: "llm", _llmError: e.message };
  }
}

/**
 * @param {string} query raw user search text
 * @returns {Promise<{isRecipe:boolean, dish?:string, ingredients?:string[], source?:"kb"|"llm", _llmError?:string}>}
 */
export async function detectRecipe(query) {
  const text = normalize(query);
  if (!text) return { isRecipe: false };

  const redis = getRedis();
  const cacheKey = `recipe:${hash(text)}`;
  const cached = await redis.get(cacheKey).catch(() => null);
  if (cached) return JSON.parse(cached);

  const kbHit = kbMatch(text);
  let result;
  if (kbHit) {
    result = { isRecipe: true, dish: kbHit.label, ingredients: kbHit.ingredients, source: "kb" };
  } else if (TRIGGER.test(text)) {
    const dishText = text.replace(TRIGGER, " ").replace(/\s+/g, " ").trim();
    result = await llmFallback(dishText || text);
  } else {
    result = { isRecipe: false };
  }

  // Never cache a transient LLM failure — would poison the cache for an hour on a blip.
  if (!result._llmError) await redis.set(cacheKey, JSON.stringify(result), "EX", 3600).catch(() => {});
  return result;
}
