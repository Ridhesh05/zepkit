import { Router } from "express";
import { generateFinalTags, splitTags, suggestGrouped } from "../tagEngine.js";
import { guardTags } from "../guardTags.js";

const router = Router();

// POST /ai/tags/grouped  { title, veg?, useLLM? } → tags grouped by language
router.post("/tags/grouped", async (req, res) => {
  const { title, veg = null, useLLM = false } = req.body ?? {};
  if (typeof title !== "string" || !title.trim()) return res.status(400).json({ error: "provide `title`" });
  try {
    const r = await suggestGrouped(title.trim(), { useLLM });
    for (const lang of Object.keys(r.byLang)) r.byLang[lang] = guardTags(r.byLang[lang], { veg }).clean;
    return res.json(r);
  } catch (err) {
    return res.status(502).json({ error: `grouped tags failed: ${err.message}` });
  }
});

// POST /ai/tags/suggest  { title, veg? }
router.post("/tags/suggest", async (req, res) => {
  const { title, veg = null } = req.body ?? {};
  if (typeof title !== "string" || !title.trim()) {
    return res.status(400).json({ error: "provide `title` (string)" });
  }
  try {
    const result = await generateFinalTags(title.trim());
    const { clean, dropped } = guardTags(result.tags, { veg });
    const { tags, aliases } = splitTags(clean);
    return res.json({
      corrected: result.corrected,
      category: result.category,
      brand: result.brand,
      veg,
      tags,
      aliases,
      meta: {
        total: clean.length,
        dropped: dropped.length,
        llm_added: result.llm_added,
        llm_error: result.llm_error, // non-null ⇒ fail-closed: only rule tags, LLM skipped
        time_s: result.time,
      },
    });
  } catch (err) {
    return res.status(502).json({ error: `tag generation failed: ${err.message}` });
  }
});

export default router;
