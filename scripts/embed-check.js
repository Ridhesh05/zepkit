#!/usr/bin/env node
/**
 * Multilingual embedding sanity check (zero-dep).
 * Proves bge-m3 puts "potato" near आलू / aloo / আলু / உருளை… and far from shampoo.
 *   node scripts/embed-check.js
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

const terms = {
  "आलू (Hindi)": "potato-group",
  "aloo (roman)": "potato-group",
  "আলু (Bengali)": "potato-group",
  "உருளைக்கிழங்கு (Tamil)": "potato-group",
  "બટાકા (Gujarati)": "potato-group",
  "दूध (Hindi: milk)": "other",
  "शैम्पू (Hindi: shampoo)": "other",
  "chicken": "other",
};

(async () => {
  const query = "potato";
  const keys = Object.keys(terms);
  const [qv, ...vs] = await embed([query, ...keys]);
  console.log(`\nquery: "${query}"   model: ${MODEL}   dim: ${qv.length}\n${"-".repeat(46)}`);
  keys
    .map((k, i) => ({ k, g: terms[k], s: cos(qv, vs[i]) }))
    .sort((a, b) => b.s - a.s)
    .forEach(({ k, g, s }) => console.log(`${s.toFixed(3)}  ${g === "potato-group" ? "✓" : " "}  ${k}`));
  console.log(`${"-".repeat(46)}\n✓ = should be a potato match (high).  Others should sit lower.\n`);
})().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
