import express from "express";
import { fileURLToPath } from "node:url";
import { config, logger } from "@zepkit/common";
import productRoutes from "./routes/products.js";
import searchRoutes from "./routes/search.js";
import aiProxyRoutes from "./routes/aiProxy.js";

const app = express();
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => res.json({ ok: true, service: "api-gateway" }));

app.use("/", productRoutes);
app.use("/", searchRoutes);
app.use("/", aiProxyRoutes);

// Serve the storefront UI (web/) from the same origin — no CORS needed.
const webDir = fileURLToPath(new URL("../../../web/", import.meta.url));
app.use(express.static(webDir));

app.use((err, _req, res, _next) => {
  logger.error(err);
  res.status(500).json({ error: "internal error" });
});

app.listen(config.ports.api, () => logger.info(`api-gateway on :${config.ports.api} · UI at http://localhost:${config.ports.api}`));
