// Ollama HTTP client: embeddings (bge-m3) + chat (gemma3).
import { config } from "@zepkit/common";

const BASE = config.ollama.baseUrl;

async function call(path, body, timeoutMs) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Ollama ${path} HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  return res.json();
}

/**
 * Embed one string or an array of strings.
 * @returns {Promise<number[][]>} one vector per input, in order.
 */
export async function embed(input, { model = config.ollama.embedModel, timeoutMs = 60000 } = {}) {
  const data = await call("/api/embed", { model, input }, timeoutMs);
  if (!Array.isArray(data.embeddings) || data.embeddings.length === 0) {
    throw new Error("Ollama returned no embeddings");
  }
  return data.embeddings;
}

/**
 * Chat completion. Pass `format` (a JSON schema) to force structured output.
 */
export async function chat(
  messages,
  { model = config.ollama.llmModel, format, options, timeoutMs = 60000 } = {},
) {
  const data = await call(
    "/api/chat",
    { model, messages, stream: false, think: false, ...(format ? { format } : {}), ...(options ? { options } : {}) },
    timeoutMs,
  );
  return data.message?.content ?? "";
}
