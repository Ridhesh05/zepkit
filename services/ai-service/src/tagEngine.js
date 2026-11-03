/**
 * ZepKit tag engine — rule-first + transliteration + LLM, ported from the V8 generator.
 * Pipeline: normalize → brand → category → rule tags (KB: Hinglish, English, 12 scripts, typos,
 * missing scripts transliterated from Hindi) → LLM (spelling/synonyms/Hinglish) → validation.
 * Indic scripts come from transliteration (rules), not the LLM, so gemma3:4b is fine here.
 */
import fs from "node:fs";
import { config } from "@zepkit/common";

const CONFIG = {
  MODEL: process.env.TAG_MODEL || config.ollama.llmModel,
  OLLAMA_URL: `${config.ollama.baseUrl}/api/chat`,
  TIMEOUT_MS: 60000,
  MAX_TAGS: 50,
  // off by default: small models write garbage Indic scripts. Transliteration handles scripts.
  LLM_SCRIPTS: process.env.TAG_LLM_SCRIPTS === "1",
  OPTIONS: { temperature: 0.1, num_predict: 600, repeat_penalty: 1.1, num_ctx: 2048 },
};

const KB = JSON.parse(fs.readFileSync(new URL("./kb/product-kb.json", import.meta.url), "utf8"));
const PRODUCT_KB = KB.categories;

// Variant words used only to drop conflicting tags (cow-milk tags on a buffalo-milk product).
const QUALIFIERS = {
  buffalo: { hi: ["bhains", "bhais", "bhens"], script: "भैंस", ka: true, native: ["भैंस", "মহিষ"] },
  cow: { hi: ["gaay", "gai", "gau"], script: "गाय", ka: true, native: ["गाय", "ఆవు", "ಹಸುವಿನ", "പശുവിൻ", "ਗਾਂ", "گائے", "பசும்பால்"] },
  mustard: { hi: ["sarson"], script: "सरसों", ka: true, native: ["सरसों", "সরিষার", "मोहरी", "கடுகு", "ఆవ", "ಸಾಸಿವೆ", "കടുക്", "ਸਰ੍ਹੋਂ", "ସୋରିଷ", "সৰিয়হৰ", "سرسوں", "સરસવ"] },
  sunflower: { hi: ["surajmukhi"], script: "सूरजमुखी", ka: true },
  groundnut: { hi: ["mungfali", "moongfali", "peanut"], script: "मूंगफली", ka: true },
  olive: { hi: [], script: "ऑलिव" },
  coconut: { hi: ["nariyal"], script: "नारियल", ka: true },
  soybean: { hi: ["soya"], script: "सोयाबीन" },
  canola: { hi: ["rapeseed"], script: "कनोला" },
  "rice bran": { hi: [], script: "राइस ब्रान" },
  toned: { hi: [], script: "टोंड" },
  "double toned": { hi: [], script: "डबल टोंड" },
  "full cream": { hi: [], script: "फुल क्रीम" },
  skimmed: { hi: [], script: "स्किम्ड" },
  brown: { hi: [], script: "ब्राउन" },
  white: { hi: ["safed"], script: "सफ़ेद" },
  "anti dandruff": { hi: [], script: "एंटी डैंड्रफ" },
  rock: { hi: ["sendha"], script: "सेंधा", native: ["सेंधा", "सैंधव", "ਸੇਂਧਾ", "ସୈନ୍ଧବ", "সৈন্ধৱ", "سیندھا", "கல்", "రాతి", "ಕಲ್ಲುಪ್ಪು", "കല്ലുപ്പ്"] },
  black: { hi: ["kala"], script: "काला" },
};
const qualForms = (q) => [q, ...QUALIFIERS[q].hi];
const QUAL_WORDS = Object.keys(QUALIFIERS).flatMap(qualForms);

const GENERIC_WORDS = new Set(
  "full fresh pure organic premium toned double cow buffalo white brown desi classic original gold special new natural healthy blue green red".split(" "),
);
const STOP_WORDS = new Set("ka ki ke wala wali wale karne ke liye for of the and se with in".split(" "));
const FORM_WORDS = new Set(
  "powder cream essence conditioner serum spray wipes carton box set mix sauce paste gel lotion oil syrup flavour flavor bottle tray combo kit holder stand".split(" "),
);

// Never in any tag, whatever the source. Substring match. Abusive words handled in the LLM prompt.
const BLOCKED = ["beef", "beaf", "pork", "bacon", "gomaans", "gaumaans", "suar", "sooar", "बीफ", "पोर्क", "सूअर", "गोमांस"];
export const isBlocked = (tag) => BLOCKED.some((w) => tag.includes(w));

const UNITS = /\b\d+(\.\d+)?\s*(kg|kgs|g|gm|gms|grams?|ml|l|ltr|litres?|liters?|pcs?|pack)\b/gi;

export function normalize(s) {
  return String(s)
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(UNITS, " ")
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/(^| )(\S+(?: \S+)*?)(?: \2)+(?= |$)/gu, "$1$2");
}

const has = (text, term) => ` ${text} `.includes(` ${term} `);
export const isLatin = (t) => /^[a-z0-9 ]+$/.test(t);

function editDistance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

function fuzzyFind(text, terms, maxTypos) {
  const words = text.split(" ");
  let best = null;
  for (const term of terms) {
    if (!isLatin(term) || !maxTypos(term)) continue;
    const k = term.split(" ").length;
    for (let i = 0; i + k <= words.length; i++) {
      const dist = editDistance(words.slice(i, i + k).join(" "), term);
      if (dist <= maxTypos(term) && (!best || dist < best.dist)) {
        best = { term, dist, fixed: [...words.slice(0, i), term, ...words.slice(i + k)].join(" ") };
      }
    }
  }
  return best;
}
const termTypos = (t) => (t.length >= 9 ? 2 : t.length >= 6 ? 1 : 0);
const brandTypos = (t) => (t.length >= 9 ? 2 : t.length >= 5 ? 1 : 0);

// ---- transliteration (Devanagari → other Indic scripts) ----
const SCRIPTS = {
  Bengali: ["Bengali", 0x980], Assamese: ["Bengali", 0x980], Gujarati: ["Gujarati", 0xa80],
  Punjabi: ["Gurmukhi", 0xa00], Odia: ["Oriya", 0xb00], Tamil: ["Tamil", 0xb80],
  Telugu: ["Telugu", 0xc00], Kannada: ["Kannada", 0xc80], Malayalam: ["Malayalam", 0xd00],
};
const LANGS = ["Hindi", "Marathi", ...Object.keys(SCRIPTS), "Urdu"];
const DRAVIDIAN = new Set(["Tamil", "Telugu", "Kannada", "Malayalam"]);
const FALLBACK = { "ॉ": "ो", "ॅ": "े", "ऑ": "ओ", "ऍ": "ए", "ँ": "ं", "व": "ब", "ष": "श", "ळ": "ल", "़": "" };
const TAMIL_FOLD = {};
for (const [to, from] of [["क", "खगघ"], ["च", "छझ"], ["ट", "ठडढ"], ["त", "थदध"], ["प", "फबभ"]])
  for (const c of from) TAMIL_FOLD[c] = to;
TAMIL_FOLD["ं"] = "म्";

export function translit(dev, lang) {
  if (lang === "Hindi" || lang === "Marathi") return dev;
  if (!SCRIPTS[lang]) return null;
  const [script, base] = SCRIPTS[lang];
  const valid = new RegExp(`^\\p{Script=${script}}$`, "u");
  const conv = (ch) => {
    const cp = ch.codePointAt(0);
    if (cp < 0x900 || cp > 0x97f) return ch;
    const t = String.fromCodePoint(cp - 0x900 + base);
    return valid.test(t) ? t : null;
  };
  let out = "";
  for (const ch of dev) {
    for (const c of lang === "Tamil" && TAMIL_FOLD[ch] ? TAMIL_FOLD[ch] : ch) {
      if (c === "़" && lang !== "Punjabi") continue;
      const t = conv(c);
      out += t ?? (FALLBACK[c] !== undefined ? [...FALLBACK[c]].map(conv).join("") : "");
    }
  }
  if (lang === "Punjabi") out = out.replace(/੍(?![ਰਵਹਯ])/g, "").replace(/([ਕ-ਹ][ਿੁ]?)ਂ/g, "$1ੰ");
  if (lang === "Bengali" || lang === "Assamese") out = out.replace(/(^|[^্])য/g, "$1য়");
  if (lang === "Odia") out = out.replace(/(^|[^୍])ଯ/g, "$1ଯ଼").replace(/ଵ/g, "ୱ");
  if (DRAVIDIAN.has(lang)) {
    const cons = `[\\u{${(base + 0x15).toString(16)}}-\\u{${(base + 0x39).toString(16)}}]`;
    out = out.replace(new RegExp(`(${cons})(?=\\s|$)`, "gu"), `$1${String.fromCodePoint(base + 0x4d)}`);
  }
  if (lang === "Assamese") out = out.replace(/র/g, "ৰ");
  return out;
}

for (const kb of Object.values(PRODUCT_KB)) {
  const hindi = kb.all_langs.Hindi?.[0];
  if (!hindi) continue;
  for (const lang of LANGS)
    if (!kb.all_langs[lang]) {
      const bn = kb.all_langs.Bengali?.[0];
      const t = lang === "Assamese" && bn ? bn.replace(/র/g, "ৰ") : translit(hindi, lang);
      if (t) kb.all_langs[lang] = [t];
    }
}

// ---- indexes ----
const TERMS = {};
for (const [cat, kb] of Object.entries(PRODUCT_KB)) {
  TERMS[cat] = [...new Set([cat, ...kb.hindi, ...kb.english, ...kb.typos, ...Object.values(kb.all_langs).flat()].map(normalize))];
}
const ALL_TERMS = new Set(Object.values(TERMS).flat());
const ALL_WORDS = new Set([...ALL_TERMS].flatMap((t) => t.split(" ")));
const FOREIGN = {};
for (const cat of Object.keys(TERMS)) {
  const own = new Set(TERMS[cat]);
  FOREIGN[cat] = [...ALL_TERMS].filter((t) => !own.has(t));
}
const BRAND_CAT = {};
for (const [cat, kb] of Object.entries(PRODUCT_KB)) {
  for (const b of kb.brands.map(normalize)) BRAND_CAT[b] = b in BRAND_CAT ? null : cat;
}
const KNOWN_BRANDS = [...new Set([...KB.umbrella_brands.map(normalize), ...Object.keys(BRAND_CAT)])].sort((a, b) => b.length - a.length);
export const TYPOS = new Set(Object.values(PRODUCT_KB).flatMap((k) => k.typos));

// ---- analysis ----
function detectBrand(text) {
  const exact = KNOWN_BRANDS.find((b) => has(text, b));
  if (exact) return { brand: exact, fixed: text };
  const fuzzy = fuzzyFind(text, KNOWN_BRANDS, brandTypos);
  return fuzzy ? { brand: fuzzy.term, fixed: fuzzy.fixed } : { brand: null, fixed: text };
}
function guessBrand(text) {
  const first = text.split(" ")[0];
  if (!first || first.length <= 2 || /^\d/.test(first)) return null;
  if (ALL_WORDS.has(first) || GENERIC_WORDS.has(first) || QUAL_WORDS.includes(first)) return null;
  return first;
}
function detectCategory(text, brand) {
  const rest = brand ? ` ${text} `.replace(` ${brand} `, " ").trim() : text;
  let best = null;
  let bestScore = 0;
  for (const [cat, terms] of Object.entries(TERMS)) {
    let score = terms
      .filter((t) => has(rest, t))
      .reduce((s, t) => s + t.split(" ").length + (rest === t || rest.endsWith(` ${t}`) ? 1 : 0), 0);
    if (brand && BRAND_CAT[brand] === cat) score += 0.5;
    if (score > bestScore) [best, bestScore] = [cat, score];
  }
  if (best) return { category: best, fixed: text };
  let fix = null;
  for (const [cat, terms] of Object.entries(TERMS)) {
    const hit = fuzzyFind(text, terms, termTypos);
    if (hit && (!fix || hit.dist < fix.dist)) fix = { ...hit, category: cat };
  }
  return fix ? { category: fix.category, fixed: fix.fixed } : { category: null, fixed: text };
}

export function analyze(product) {
  const text = normalize(product);
  const b = detectBrand(text);
  const { category, fixed } = detectCategory(b.fixed, b.brand);
  const brand = b.brand || guessBrand(fixed);
  const quals = Object.keys(QUALIFIERS).filter((q) => qualForms(q).some((f) => has(fixed, f)));
  const source = category ? TERMS[category] : [text, fixed];
  const words = (arr) => arr.filter(Boolean).flatMap((t) => t.split(" ")).filter((w) => !STOP_WORDS.has(w));
  const anchors = new Set(words([...source, ...quals.flatMap(qualForms)]));
  const familiar = new Set([...anchors, ...words([text, fixed, brand])]);
  return { text, fixed, category, brand, quals, anchors, familiar };
}

function conflicts(tag, quals) {
  return Object.keys(QUALIFIERS)
    .filter((q) => !quals.includes(q))
    .some((q) => [...qualForms(q), ...(QUALIFIERS[q].native || [])].some((f) => has(tag, f)));
}

const PHONETIC = [[/c(?!h)/g, "k"], [/ph/g, "f"], [/ee/g, "i"], [/oo/g, "u"], [/([a-z])\1/g, "$1"], [/z/g, "s"], [/w/g, "v"], [/x/g, "ks"]];
const phoneticTypos = (w) => [...new Set(PHONETIC.map(([re, r]) => w.replace(re, r)))].filter((v) => v !== w).slice(0, 2);

export function generateRuleTags({ text, fixed = text, category, brand, quals = [] }) {
  const core = [];
  const extras = [];
  const push = (arr) => (t) => {
    t = t && normalize(t);
    if (t && !core.includes(t) && !extras.includes(t) && !conflicts(t, quals)) arr.push(t);
  };
  const add = push(core);

  add(fixed);
  add(text);
  if (brand) add(brand);
  KNOWN_BRANDS.filter((b) => has(fixed, b)).forEach(add);

  const kb = category && PRODUCT_KB[category];
  if (kb) {
    const plain = (arr) => arr.filter((w) => !QUAL_WORDS.some((f) => has(w, f)));
    const hi = plain(kb.hindi).slice(0, 2);
    const en = plain(kb.english)[0] || category;
    const hiScript = kb.all_langs.Hindi?.[0];
    for (const q of quals) {
      const Q = QUALIFIERS[q];
      if (hiScript && Q.script) add(`${Q.script}${Q.ka ? " का" : ""} ${hiScript}`);
      Q.hi.forEach((h) => hi.forEach((w) => add(`${h}${Q.ka ? " ka" : ""} ${w}`)));
      qualForms(q).forEach((f) => add(`${f} ${en}`));
      hi.forEach((w) => add(`${q} ${w}`));
      kb.typos.slice(0, 2).forEach((t) => add(`${q} ${t}`));
      if (brand) add(`${brand} ${q} ${en}`);
    }
    if (brand) {
      hi.forEach((h) => add(`${brand} ${h}`));
      add(`${brand} ${category}`);
      add(`${brand} ${en}`);
      if (hiScript) add(`${brand} ${hiScript}`);
    }
    kb.hindi.forEach(add);
    kb.english.forEach(add);
    LANGS.forEach((l) => add(kb.all_langs[l]?.[0]));
    kb.typos.forEach(add);
    LANGS.forEach((l) => (kb.all_langs[l] || []).slice(1).forEach(push(extras)));
  }
  if (brand && isLatin(brand)) {
    phoneticTypos(brand).forEach((t) => {
      add(t);
      if (kb) add(`${t} ${category}`);
    });
  }
  return { core, extras };
}

const near = (w, set) => set.has(w) || (w.length >= 4 && [...set].some((a) => a.length >= 4 && editDistance(a, w) <= 1));

export function isValidTag(tag, { category, brand, quals = [], anchors, familiar = anchors }) {
  if (tag.length < 2 || tag.length > 40 || tag.split(" ").length > 5) return false;
  if (/\d/.test(tag)) return false;
  if (conflicts(tag, quals)) return false;
  if (category && FOREIGN[category].some((f) => has(tag, f))) return false;
  if (!isLatin(tag)) return true;
  const words = tag.split(" ").filter((w) => !STOP_WORDS.has(w));
  if (words.some((w) => FORM_WORDS.has(w) && !anchors.has(w))) return false;
  if (new Set(words).size < words.length) return false;
  if (brand && has(tag, brand) && !tag.startsWith(brand)) return false;
  if (!words.some((w) => near(w, anchors))) return false;
  if (category) return words.length >= 2 && words.every((w) => familiar.has(w));
  return words.filter((w) => !near(w, familiar)).length <= 1;
}

// ---- LLM ----
const STR = { type: "string" };
const ARR = { type: "array", items: STR };

function buildSchema(scripts) {
  const properties = { corrected_name: STR, brand: STR, product_type: STR, english_synonyms: ARR, hinglish: ARR };
  const required = ["corrected_name", "brand", "product_type", "english_synonyms", "hinglish"];
  if (scripts) { properties.hindi_devanagari = ARR; required.push("hindi_devanagari"); }
  return { type: "object", properties, required };
}
function buildSystem(scripts) {
  return `You are a catalog expert for an Indian quick-commerce app (Zepto/Blinkit).
Return JSON with:
- corrected_name: product name with spelling fixed.
- brand: brand name only, "" if none.
- product_type: generic product type in English, 1-3 words, no brand (e.g. "detergent powder").
- english_synonyms: 6 different English words/phrases Indian shoppers type to find this product type.
- hinglish: 4 search phrases in Hindi written in English letters only (Roman script).${scripts ? "\n- hindi_devanagari: 5 common search words/phrases for this product in Hindi, written in Devanagari script (used to generate other Indian languages)." : ""}
Every value must be about THIS product only. No sizes, prices or other products.
STRICT: never output abusive, vulgar, sexual, offensive or insulting words in any language or spelling, and never mention beef or pork. If unsure about a word, leave it out.`;
}

async function understandLLM(product, { category, brand, quals }, known, { scripts = CONFIG.LLM_SCRIPTS } = {}) {
  const user = [
    `Product: "${product}"`,
    category ? `Product type: ${category}` : "",
    brand ? `Brand: ${brand}` : "",
    quals.length ? `Variant: ${quals.join(", ")}. Keep this variant in every phrase.` : "",
    known.length ? `Already have (give different ones): ${JSON.stringify(known.slice(0, 12))}` : "",
  ].filter(Boolean).join("\n");
  try {
    const res = await fetch(CONFIG.OLLAMA_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(CONFIG.TIMEOUT_MS),
      body: JSON.stringify({
        model: CONFIG.MODEL,
        messages: [{ role: "system", content: buildSystem(scripts) }, { role: "user", content: user }],
        stream: false, think: false, format: buildSchema(scripts), options: CONFIG.OPTIONS,
      }),
    });
    if (!res.ok) throw new Error(`Ollama HTTP ${res.status}: ${(await res.text()).slice(0, 120)}`);
    const out = JSON.parse((await res.json()).message?.content || "{}");
    const list = (v) => (Array.isArray(v) ? v.filter((t) => typeof t === "string").map(normalize).filter(Boolean) : []);
    return {
      corrected_name: normalize(out.corrected_name || ""),
      product_type: normalize(out.product_type || ""),
      english_synonyms: list(out.english_synonyms),
      hinglish: list(out.hinglish).filter(isLatin),
      hindi_devanagari: list(out.hindi_devanagari).filter((t) => /^[ऀ-ॿ\s]+$/.test(t)),
    };
  } catch (e) {
    // fail-closed for LLM tags: on error we keep only the (pre-vetted, curated) rule tags.
    return { english_synonyms: [], hinglish: [], hindi_devanagari: [], _llmError: e.message };
  }
}

export async function generateFinalTags(product) {
  const t0 = Date.now();
  let a = analyze(product);
  let { core, extras } = generateRuleTags(a);
  const kb = a.category && PRODUCT_KB[a.category];
  const llm = await understandLLM(product, a, kb ? [...kb.english, ...kb.hindi] : core.slice(0, 8));

  if (!a.category) {
    for (const guess of [llm.corrected_name, llm.product_type]) {
      const b = guess ? analyze(guess) : null;
      if (b?.category) {
        a = { ...b, text: a.text, brand: a.brand || b.brand };
        ({ core, extras } = generateRuleTags(a));
        break;
      }
    }
  }

  const generic = [];
  if (!a.category && llm.product_type) {
    generic.push(llm.product_type);
    if (a.brand) generic.push(`${a.brand} ${llm.product_type}`);
    const ptWords = llm.product_type.split(" ").filter((w) => !STOP_WORDS.has(w));
    a.anchors = new Set([...a.anchors, ...ptWords]);
    a.familiar = new Set([...a.familiar, ...ptWords]);
  }

  const llmTags = [
    ...llm.english_synonyms,
    ...(a.brand ? llm.english_synonyms.slice(0, 2).map((s) => normalize(`${a.brand} ${s}`)) : []),
    ...llm.hinglish,
  ].filter((t) => isValidTag(t, a));

  const scripts = a.category ? [] : llm.hindi_devanagari.flatMap((h) => LANGS.map((l) => translit(h, l)).filter(Boolean));

  const tags = [...new Set([...core, ...generic, ...llmTags, ...scripts, ...extras])]
    .filter((t) => !isBlocked(t))
    .slice(0, CONFIG.MAX_TAGS);

  return {
    product,
    corrected: a.fixed,
    category: a.category || "generic",
    brand: a.brand,
    tags,
    llm_added: llmTags.filter((t) => !core.includes(t)).length,
    llm_error: llm._llmError || null,
    time: ((Date.now() - t0) / 1000).toFixed(2),
  };
}

// Split a flat tag list into display chips (few, readable Latin) vs aliases (the full net).
export function splitTags(flat) {
  const tags = [];
  for (const t of flat) {
    if (tags.length < 8 && isLatin(t) && t.split(" ").length <= 3 && !TYPOS.has(t)) tags.push(t);
  }
  return { tags, aliases: flat.filter((t) => !tags.includes(t)) };
}

// Rule-only tags (no LLM call) — instant, used for bulk seeding.
export function ruleOnly(product) {
  const a = analyze(product);
  const { core, extras } = generateRuleTags(a);
  const flat = [...new Set([...core, ...extras])].filter((t) => !isBlocked(t)).slice(0, CONFIG.MAX_TAGS);
  return { corrected: a.fixed, category: a.category || "generic", brand: a.brand, flat };
}

// Display order for the per-language tag editor.
export const LANG_ORDER = ["English", "Hinglish", "Hindi", "Marathi", "Bengali", "Assamese", "Gujarati", "Punjabi", "Odia", "Tamil", "Telugu", "Kannada", "Malayalam", "Urdu"];

/**
 * Tags grouped by language (English / Hinglish / native scripts). `useLLM` adds Gemma synonyms;
 * otherwise it's instant "dictionary only".
 */
export async function suggestGrouped(product, { useLLM = false } = {}) {
  const t0 = Date.now();
  const a = analyze(product);
  const kb = a.category && PRODUCT_KB[a.category];
  const llm = useLLM
    ? await understandLLM(product, a, kb ? [...kb.english, ...kb.hindi] : [], { scripts: true })
    : { english_synonyms: [], hinglish: [], hindi_devanagari: [], _llmError: null };

  const byLang = {};
  const add = (lang, t) => {
    t = t && normalize(t);
    if (!t || isBlocked(t) || conflicts(t, a.quals)) return;
    (byLang[lang] ??= []);
    if (!byLang[lang].includes(t) && byLang[lang].length < 10) byLang[lang].push(t);
  };

  const enKb = kb ? kb.english : [];
  const hiKb = kb ? kb.hindi : [];

  // English
  if (a.fixed && isLatin(a.fixed)) add("English", a.fixed);
  enKb.forEach((t) => add("English", t));
  if (kb) add("English", a.category);
  if (a.brand && enKb[0]) add("English", `${a.brand} ${enKb[0]}`);
  llm.english_synonyms.forEach((t) => add("English", t));

  // Hinglish (roman Hindi)
  if (a.brand) add("Hinglish", a.brand);
  hiKb.forEach((t) => add("Hinglish", t));
  if (a.brand) hiKb.slice(0, 2).forEach((h) => add("Hinglish", `${a.brand} ${h}`));
  llm.hinglish.forEach((t) => add("Hinglish", t));
  if (kb) kb.typos.filter(isLatin).forEach((t) => add("Hinglish", t));

  // native scripts — KB curated where available, else transliterate Hindi seeds (KB + LLM) to every script
  const hindiSeeds = [...new Set([...(kb ? kb.all_langs.Hindi || [] : []), ...llm.hindi_devanagari])];
  hindiSeeds.forEach((h) => add("Hindi", h));
  for (const lang of LANGS) {
    if (lang === "Hindi") continue;
    if (kb && kb.all_langs[lang]) kb.all_langs[lang].forEach((t) => add(lang, t));
    else hindiSeeds.forEach((h) => { const t = translit(h, lang); if (t) add(lang, t); });
  }

  const ordered = {};
  for (const l of LANG_ORDER) if (byLang[l]?.length) ordered[l] = byLang[l];
  const count = Object.values(ordered).reduce((s, arr) => s + arr.length, 0);
  return { category: a.category || "generic", brand: a.brand, corrected: a.fixed, byLang: ordered, count, ms: Date.now() - t0, source: useLLM ? "ai" : "dictionary", llm_error: llm._llmError || null };
}
