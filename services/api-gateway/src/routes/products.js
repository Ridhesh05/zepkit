import { Router } from "express";
import { EventType, makeEvent } from "@zepkit/common";
import { publish } from "../lib/producer.js";
import { makeProductId } from "../lib/id.js";
import { validateProduct, toPayload } from "../schemas/product.js";
import { requireAdmin } from "../middleware/requireAdmin.js";

const router = Router();

// POST /products — validate, assign id, publish product.created, return 202.
router.post("/products", requireAdmin, async (req, res) => {
  const errors = validateProduct(req.body);
  if (errors.length) return res.status(400).json({ errors });
  const id = makeProductId();
  const payload = toPayload(id, req.body);
  try {
    await publish(makeEvent(EventType.ProductCreated, payload));
    return res.status(202).json({ productId: id, status: "indexing" });
  } catch (err) {
    return res.status(502).json({ error: `publish failed: ${err.message}` });
  }
});

// PATCH /products/:id — publish product.updated (partial fields merged by the worker).
router.patch("/products/:id", requireAdmin, async (req, res) => {
  const payload = { ...toPayload(req.params.id, { title: req.body.title ?? "x", ...req.body }), _id: req.params.id };
  try {
    await publish(makeEvent(EventType.ProductUpdated, payload));
    return res.status(202).json({ productId: req.params.id, status: "indexing" });
  } catch (err) {
    return res.status(502).json({ error: `publish failed: ${err.message}` });
  }
});

// DELETE /products/:id — publish product.deleted.
router.delete("/products/:id", requireAdmin, async (req, res) => {
  try {
    await publish(makeEvent(EventType.ProductDeleted, { _id: req.params.id }));
    return res.status(202).json({ productId: req.params.id, status: "deleting" });
  } catch (err) {
    return res.status(502).json({ error: `publish failed: ${err.message}` });
  }
});

export default router;
