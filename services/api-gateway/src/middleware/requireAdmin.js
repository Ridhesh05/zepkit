import { config } from "@zepkit/common";

// Minimal RBAC: admin routes require a shared secret in the X-Admin-Key header.
export function requireAdmin(req, res, next) {
  const key = req.headers["x-admin-key"];
  if (!key || key !== config.adminKey) {
    return res.status(401).json({ error: "invalid or missing admin key" });
  }
  next();
}
