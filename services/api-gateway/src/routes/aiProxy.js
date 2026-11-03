import { Router } from "express";
import { config } from "@zepkit/common";
import { requireAdmin } from "../middleware/requireAdmin.js";

// Proxy AI endpoints to the ai-service so the browser (served from this origin) can reach them.
const router = Router();

async function forward(path, req, res) {
  try {
    const r = await fetch(`${config.aiService.url}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(60000),
      body: JSON.stringify(req.body ?? {}),
    });
    const data = await r.json().catch(() => ({}));
    res.status(r.status).json(data);
  } catch (e) {
    res.status(502).json({ error: `ai service unreachable: ${e.message}` });
  }
}

router.post("/ai/tags/suggest", requireAdmin, (req, res) => forward("/ai/tags/suggest", req, res));
router.post("/ai/tags/grouped", requireAdmin, (req, res) => forward("/ai/tags/grouped", req, res));
router.post("/ai/embed", requireAdmin, (req, res) => forward("/ai/embed", req, res));

export default router;
