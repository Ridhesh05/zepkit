import { Router } from "express";
import { search, resolveLocation, listStores, listCategories, analytics, mapAlias, logEvent } from "../services/searchService.js";
import { requireAdmin } from "../middleware/requireAdmin.js";

const router = Router();

// Admin key check (admin page calls this to validate the entered key).
router.get("/admin/verify", requireAdmin, (_req, res) => res.json({ ok: true }));

// POST /events  { type: "add"|"click", store?, productId?, query? }
router.post("/events", (req, res) => {
  const { type, store, productId, query } = req.body ?? {};
  if (type === "add" || type === "click") logEvent(type, { store, productId, query });
  res.json({ ok: true });
});

// GET /search?q=&store=S1&category=
router.get("/search", async (req, res) => {
  const { q = "", store, category } = req.query;
  if (!store) return res.status(400).json({ error: "store is required (resolve a pincode first)" });
  try {
    return res.json(await search({ q: String(q), store: String(store), category: category ? String(category) : undefined }));
  } catch (err) {
    return res.status(502).json({ error: `search failed: ${err.message}` });
  }
});

// GET /locations/resolve?pincode=400053
router.get("/locations/resolve", async (req, res) => {
  const { pincode } = req.query;
  if (!pincode) return res.status(400).json({ error: "pincode is required" });
  try {
    return res.json(await resolveLocation(String(pincode)));
  } catch (err) {
    return res.status(502).json({ error: `resolve failed: ${err.message}` });
  }
});

router.get("/stores", async (_req, res) => res.json(await listStores()));
router.get("/categories", async (_req, res) => res.json(await listCategories()));

// Phase 7 — admin analytics + approve
router.get("/admin/analytics", requireAdmin, async (req, res) => {
  try {
    return res.json(await analytics(req.query.store ? String(req.query.store) : undefined));
  } catch (err) {
    return res.status(502).json({ error: err.message });
  }
});

router.post("/admin/map-alias", requireAdmin, async (req, res) => {
  const { query, productId } = req.body ?? {};
  if (!query || !productId) return res.status(400).json({ error: "query and productId required" });
  try {
    return res.json(await mapAlias(String(query), String(productId)));
  } catch (err) {
    return res.status(502).json({ error: err.message });
  }
});

export default router;
