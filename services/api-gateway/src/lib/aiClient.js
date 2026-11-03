import { config } from "@zepkit/common";

const BASE = config.aiService.url;

export async function embedQuery(text) {
  const res = await fetch(`${BASE}/ai/embed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(30000),
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error(`ai/embed ${res.status}`);
  return (await res.json()).embedding;
}

export async function detectRecipe(query) {
  const res = await fetch(`${BASE}/ai/recipe/detect`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(20000),
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`ai/recipe/detect ${res.status}`);
  return res.json();
}
