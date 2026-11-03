import { Router } from "express";
import { search, resolveLocation, listStores, listCategories, analytics, mapAlias, logEvent, saveLoadTest, getLoadTests } from "../services/searchService.js";
import { indexInfo, browseDocuments, runReindex } from "../../../../infra/typesense/reindex.js";
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

// k6 posts load-test summaries here; admin dashboard reads them
router.post("/admin/loadtest", requireAdmin, async (req, res) => {
  try { return res.json(await saveLoadTest(req.body || {})); }
  catch (err) { return res.status(502).json({ error: err.message }); }
});
router.get("/admin/loadtest", requireAdmin, async (_req, res) => {
  try { return res.json(await getLoadTests()); }
  catch (err) { return res.status(502).json({ error: err.message }); }
});

// Index tab — browse the live TypeSense index without any third-party dashboard (avoids the
// HTTPS-dashboard → HTTP-localhost mixed-content block entirely, since this is same-origin).
router.get("/admin/index", requireAdmin, async (_req, res) => {
  try { return res.json(await indexInfo()); }
  catch (err) { return res.status(502).json({ error: err.message }); }
});
router.get("/admin/index/documents", requireAdmin, async (req, res) => {
  try { return res.json({ documents: await browseDocuments({ q: req.query.q || "", limit: Number(req.query.limit) || 20 }) }); }
  catch (err) { return res.status(502).json({ error: err.message }); }
});
router.post("/admin/reindex", requireAdmin, async (_req, res) => {
  try { return res.json(await runReindex()); }
  catch (err) { return res.status(502).json({ error: err.message }); }
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
