import { Router } from "express";
import { config } from "@zepkit/common";
import { embedText, embedBatch } from "../services/embedder.js";

const router = Router();

// POST /ai/embed  { text } | { texts: [...] }
router.post("/embed", async (req, res) => {
  const { text, texts } = req.body ?? {};
  try {
    if (Array.isArray(texts)) {
      const embeddings = await embedBatch(texts);
      return res.json({ model: config.ollama.embedModel, dim: embeddings[0]?.length, embeddings });
    }
    if (typeof text === "string") {
      const embedding = await embedText(text);
      return res.json({ model: config.ollama.embedModel, dim: embedding.length, embedding });
    }
    return res.status(400).json({ error: "provide `text` (string) or `texts` (array)" });
  } catch (err) {
    return res.status(502).json({ error: `embed failed: ${err.message}` });
  }
});

export default router;
