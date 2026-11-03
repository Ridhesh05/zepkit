import { createHash } from "node:crypto";
import { getTypesense, getRedis, getDb, config, logger, makeEvent, EventType } from "@zepkit/common";
import { embedQuery, detectRecipe } from "../lib/aiClient.js";
import { publish } from "../lib/producer.js";

const COLL = config.typesense.collection;
const hash = (s) => createHash("sha1").update(s).digest("hex").slice(0, 16);

// Parse a natural-language price constraint out of the query ("amul doodh 60 se kam").
export function parsePrice(q) {
  let max = null, min = null, s = ` ${q} `;
  const under = s.match(/(?:under|below|less than|upto|up to|<)\s*₹?\s*(\d+)/i) || s.match(/₹?\s*(\d+)\s*(?:se\s*kam|ke\s*niche|ke\s*neeche|tak|se\s*neeche|or\s*less|rs\s*ke\s*andar)/i);
  if (under) { max = Number(under[1]); s = s.replace(under[0], " "); }
  const over = s.match(/(?:above|over|more than|>)\s*₹?\s*(\d+)/i) || s.match(/₹?\s*(\d+)\s*(?:se\s*zyada|se\s*upar|ke\s*upar)/i);
  if (over) { min = Number(over[1]); s = s.replace(over[0], " "); }
  return { max, min, q: s.replace(/\s+/g, " ").trim() };
}

async function queryVector(q) {
  const redis = getRedis();
  const key = `qvec:${hash(q)}`;
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached);
  const vec = await embedQuery(q);
  await redis.set(key, JSON.stringify(vec), "EX", 3600);
  return vec;
}

async function enrichHits(hits, store) {
  const redis = getRedis();
  const docs = hits.map((h) => h.document);
  if (docs.length === 0) return [];
  const vals = await redis.mget(docs.map((d) => `store:${store}:product:${d.id}`));
  return docs.map((d, i) => {
    const sv = vals[i] ? JSON.parse(vals[i]) : null;
    const price = sv?.price ?? d.price;
    return {
      id: d.id, title: d.title, category: d.category, veg: d.veg,
      price, stock: sv?.stock ?? d.stock, inStock: (sv?.stock ?? d.stock) > 0,
    };
  });
}

async function run(params) {
  const res = await getTypesense().multiSearch.perform({ searches: [{ collection: COLL, ...params }] });
  return res.results[0];
}

export async function search({ q = "", store, category, perPage = 40, detectIntent = true }) {
  const t0 = Date.now();

  // Recipe/intent detection: "paneer butter masala banana hai" → resolve each ingredient to a
  // real product instead of a single flat keyword/vector match. Only on top-level calls (not the
  // per-ingredient lookups recipeSearch() itself makes — detectIntent:false avoids recursion).
  if (detectIntent && q.trim() && !category) {
    let recipe = null;
    try {
      recipe = await detectRecipe(q);
    } catch {
      /* ai-service unreachable → fail closed, fall through to normal search */
    }
    if (recipe?.isRecipe) {
      const ingredients = await recipeSearch(recipe.dish, recipe.ingredients, store);
      const results = ingredients.map((i) => i.product).filter(Boolean);
      const out = {
        query: q, cleanQuery: q, priceMax: null, priceMin: null, store, category: null,
        mode: "recipe", missed: false, count: results.length, results, ms: Date.now() - t0,
        recipe: { dish: recipe.dish, ingredients },
      };
      logSearch(q, store, results.length, false);
      return out;
    }
  }

  const { max, min, q: cleanQ } = parsePrice(q);
  const priceFilter = [];
  if (max != null) priceFilter.push(`price:<=${max}`);
  if (min != null) priceFilter.push(`price:>=${min}`);

  const redis = getRedis();
  const cacheKey = `search:${hash(`${q}|${store}|${category || ""}`)}`;
  const cached = await redis.get(cacheKey);
  if (cached) return { ...JSON.parse(cached), cached: true, ms: Date.now() - t0 };

  const filters = [`store_ids:=${store}`, ...priceFilter];
  if (category) filters.push(`category:=${category}`);
  const filter_by = filters.join(" && ");

  let result, mode = "browse", missed = false;
  if (!cleanQ.trim()) {
    result = await run({ q: "*", query_by: "title", filter_by, sort_by: "stock:desc", per_page: perPage });
  } else {
    mode = "hybrid";
    const vec = await queryVector(cleanQ);
    result = await run({ q: cleanQ, query_by: "title,tags,aliases", vector_query: `embedding:([${vec.join(",")}], k:${perPage})`, filter_by, per_page: perPage });
    const hits = result.hits ?? [];
    const hasKeyword = hits.some((h) => (h.text_match || 0) > 0);
    // best semantic distance (lower = closer); < ~0.5 means a genuinely relevant match
    const bestDist = hits.length ? Math.min(...hits.map((h) => h.vector_distance ?? 1)) : 1;
    if (!hasKeyword && bestDist >= 0.5) { mode = "closest"; missed = true; }
    else if (!hasKeyword) { mode = "closest"; } // good semantic match, label but don't flag as missed
  }

  const results = await enrichHits(result.hits ?? [], store);
  const out = { query: q, cleanQuery: cleanQ, priceMax: max, priceMin: min, store, category: category || null, mode, missed, count: results.length, results, ms: Date.now() - t0 };
  await redis.set(cacheKey, JSON.stringify(out), "EX", 60);
  logSearch(q, store, results.length, missed);
  return out;
}

// Resolve each recipe ingredient to a real in-stock product via the existing search() pipeline.
// Each inner call still runs the full hybrid-search + cache + logSearch() path — a missed
// ingredient (e.g. "cream" if it weren't in the catalog) lands in search_logs and shows up in the
// admin "missed searches" tab automatically, with no extra logging code needed here.
export async function recipeSearch(_dish, ingredients, store) {
  const hits = await Promise.all(
    ingredients.map((term) => search({ q: term, store, perPage: 5, detectIntent: false })),
  );
  return ingredients.map((term, i) => {
    const list = hits[i].results || [];
    const product = list.find((p) => p.inStock) ?? list[0] ?? null;
    return { term, product };
  });
}

export async function resolveLocation(pincode) {
  const db = await getDb();
  const store = await db.collection("dark_stores").findOne({ servicePincodes: pincode });
  if (!store) return { serviceable: false, pincode };
  return { serviceable: true, pincode, store: { id: store._id, name: store.name } };
}

export async function listStores() {
  const db = await getDb();
  return (await db.collection("dark_stores").find().toArray()).map((s) => ({ id: s._id, name: s.name, pincodes: s.servicePincodes }));
}

export async function listCategories() {
  const db = await getDb();
  return (await db.collection("products").distinct("category")).sort();
}

// ---- events (clicks / adds) ----
export function logEvent(type, data) {
  getDb().then((db) => db.collection("events").insertOne({ type, ...data, ts: new Date().toISOString() })).catch(() => {});
}

// ---- analytics ----
function scriptOf(q) {
  if (/[ऀ-ॿ]/.test(q)) return "Devanagari (Hindi/Marathi)";
  if (/[ঀ-৿]/.test(q)) return "Bengali/Assamese";
  if (/[઀-૿]/.test(q)) return "Gujarati";
  if (/[਀-੿]/.test(q)) return "Punjabi";
  if (/[଀-୿]/.test(q)) return "Odia";
  if (/[஀-௿]/.test(q)) return "Tamil";
  if (/[ఀ-౿]/.test(q)) return "Telugu";
  if (/[ಀ-೿]/.test(q)) return "Kannada";
  if (/[ഀ-ൿ]/.test(q)) return "Malayalam";
  if (/[؀-ۿ]/.test(q)) return "Urdu";
  return "Roman (English, Hinglish)";
}

export async function analytics(store) {
  const db = await getDb();
  const match = store ? { store } : {};
  const logs = await db.collection("search_logs").find(match).sort({ ts: -1 }).limit(5000).toArray();
  const events = await db.collection("events").find(store ? { store } : {}).limit(5000).toArray();

  const total = logs.length;
  const missed = logs.filter((l) => l.missed).length;
  const noStore = logs.filter((l) => !l.store).length;
  const counts = {}, scripts = {}, days = {};
  for (const l of logs) {
    if (l.query) counts[l.query] = (counts[l.query] || 0) + 1;
    const sc = scriptOf(l.query || "");
    scripts[sc] = (scripts[sc] || 0) + 1;
    const day = (l.ts || "").slice(0, 10);
    days[day] = days[day] || { searches: 0, clicks: 0, adds: 0 };
    days[day].searches++;
  }
  for (const e of events) {
    const day = (e.ts || "").slice(0, 10);
    days[day] = days[day] || { searches: 0, clicks: 0, adds: 0 };
    if (e.type === "add") days[day].adds++;
    if (e.type === "click") days[day].clicks++;
  }
  const adds = events.filter((e) => e.type === "add").length;
  const clicks = events.filter((e) => e.type === "click").length;
  const sortTop = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]);

  return {
    total,
    unique: Object.keys(counts).length,
    missedCount: missed,
    zeroRate: total ? +((missed / total) * 100).toFixed(1) : 0,
    noStore,
    adds,
    clicks,
    ctr: total ? +((clicks / total) * 100).toFixed(1) : 0,
    byScript: sortTop(scripts).map(([name, count]) => ({ name, count })),
    perDay: Object.entries(days).sort((a, b) => a[0].localeCompare(b[0])).slice(-14).map(([day, v]) => ({ day, ...v })),
    top: sortTop(counts).slice(0, 12).map(([query, count]) => ({ query, count })),
    missed: sortTop(logs.filter((l) => l.missed).reduce((o, l) => ((o[l.query] = (o[l.query] || 0) + 1), o), {})).slice(0, 12).map(([query, count]) => ({ query, count })),
  };
}

export async function mapAlias(query, productId) {
  const db = await getDb();
  const p = await db.collection("products").findOne({ _id: productId });
  if (!p) throw new Error("product not found");
  const aliases = [...new Set([...(p.aliases || []), String(query).toLowerCase().trim()])];
  const inv = await db.collection("inventory").find({ productId }).toArray();
  await publish(makeEvent(EventType.ProductUpdated, {
    _id: productId, title: p.title, category: p.category, veg: p.veg, unit: p.unit, imageUrl: p.imageUrl,
    tags: p.tags, aliases, inventory: inv.map((i) => ({ storeId: i.storeId, stock: i.stock, price: i.price })),
  }));
  const redis = getRedis();
  const keys = await redis.keys("search:*");
  if (keys.length) await redis.del(...keys);
  return { ok: true, productId, title: p.title, aliasesCount: aliases.length };
}

// ---- load-test runs (posted by k6 handleSummary) ----
export async function saveLoadTest(run) {
  const db = await getDb();
  await db.collection("loadtest_runs").insertOne({ ...run, savedAt: new Date().toISOString() });
  const old = await db.collection("loadtest_runs").find().sort({ savedAt: -1 }).skip(20).toArray();
  if (old.length) await db.collection("loadtest_runs").deleteMany({ _id: { $in: old.map((d) => d._id) } });
  return { ok: true };
}
export async function getLoadTests() {
  const db = await getDb();
  const runs = await db.collection("loadtest_runs").find().sort({ savedAt: -1 }).limit(10).toArray();
  return { latest: runs[0] || null, history: runs };
}

function logSearch(query, store, resultCount, missed) {
  if (!query.trim()) return;
  getDb().then((db) => db.collection("search_logs").insertOne({ query, store, resultCount, missed: !!missed, ts: new Date().toISOString() })).catch((e) => logger.debug("log fail", e.message));
}
