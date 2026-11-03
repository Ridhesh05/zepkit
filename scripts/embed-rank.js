#!/usr/bin/env node
/**
 * Realistic retrieval check: rank a small product corpus against multilingual queries.
 * This is how search actually works — query vs enriched product docs (title+tags+aliases).
 *   node scripts/embed-rank.js
 */
const BASE = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
const MODEL = process.env.EMBED_MODEL || "bge-m3";

async function embed(input) {
  const res = await fetch(`${BASE}/api/embed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, input }),
  });
  if (!res.ok) throw new Error(`Ollama HTTP ${res.status}: ${(await res.text()).slice(0, 160)}`);
  return (await res.json()).embeddings;
}
const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
const norm = (a) => Math.sqrt(dot(a, a));
const cos = (a, b) => dot(a, b) / (norm(a) * norm(b));

// enriched product docs = what we actually store the vector of (title + tags + aliases)
const products = {
  Potato: "Aloo 1kg potato आलू aloo আলু উরুলৈ બટાકા vegetable sabzi fresh",
  Chicken: "Chicken 1kg murgh चिकन মুরগি meat non veg protein",
  Shampoo: "Dove shampoo शैम्पू hair care conditioner",
  Milk: "Amul milk doodh दूध দুধ dairy toned",
  Tomato: "Tomato tamatar टमाटर টমেটো vegetable fresh",
};
const queries = ["potato", "आलू", "aloo", "আলু", "உருளைக்கிழங்கு", "બટાકા"];

(async () => {
  const names = Object.keys(products);
  const [...pv] = await embed(Object.values(products));
  console.log(`\nmodel: ${MODEL}   corpus: ${names.join(", ")}\n${"=".repeat(52)}`);
  let hits = 0;
  for (const q of queries) {
    const [qv] = await embed(q);
    const ranked = names
      .map((n, i) => ({ n, s: cos(qv, pv[i]) }))
      .sort((a, b) => b.s - a.s);
    const top = ranked[0];
    const ok = top.n === "Potato";
    hits += ok;
    console.log(
      `${ok ? "✅" : "❌"} query "${q}"  → top: ${top.n} (${top.s.toFixed(3)})   ` +
        ranked.slice(1, 3).map((r) => `${r.n}:${r.s.toFixed(3)}`).join("  "),
    );
  }
  console.log(`${"=".repeat(52)}\n${hits}/${queries.length} queries ranked the Potato product #1\n`);
})().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
