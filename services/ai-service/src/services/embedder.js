// Embedding service: wraps the Ollama bge-m3 client.
import { embed } from "../lib/ollama.js";

export async function embedText(text) {
  if (typeof text !== "string" || !text.trim()) throw new Error("text must be a non-empty string");
  const [vec] = await embed(text.trim());
  return vec;
}

export async function embedBatch(texts) {
  const clean = texts.map((t) => String(t ?? "").trim()).filter(Boolean);
  if (clean.length === 0) throw new Error("texts must contain at least one non-empty string");
  return embed(clean);
}
