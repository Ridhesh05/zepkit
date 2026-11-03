import { config } from "@zepkit/common";

const BASE = config.aiService.url;

export async function embed(text) {
  const res = await fetch(`${BASE}/ai/embed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(60000),
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error(`ai/embed ${res.status}`);
  return (await res.json()).embedding;
}

export async function suggestTags(title, veg) {
  const res = await fetch(`${BASE}/ai/tags/suggest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(60000),
    body: JSON.stringify({ title, veg }),
  });
  if (!res.ok) throw new Error(`ai/tags/suggest ${res.status}`);
  const d = await res.json();
  return { tags: d.tags ?? [], aliases: d.aliases ?? [] };
}
