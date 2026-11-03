import { Router } from "express";
import { detectRecipe } from "../recipeEngine.js";

const router = Router();

// POST /ai/recipe/detect  { query } → { isRecipe, dish?, ingredients?, source?, _llmError? }
router.post("/recipe/detect", async (req, res) => {
  const { query } = req.body ?? {};
  if (typeof query !== "string" || !query.trim()) return res.status(400).json({ error: "provide `query`" });
  try {
    return res.json(await detectRecipe(query.trim()));
  } catch (err) {
    return res.status(502).json({ error: `recipe detection failed: ${err.message}` });
  }
});

export default router;
