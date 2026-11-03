import express from "express";
import { config } from "@zepkit/common";
import { logger } from "./lib/logger.js";
import embedRoutes from "./routes/embed.js";
import tagRoutes from "./routes/tags.js";

const app = express();
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => res.json({ ok: true, service: "ai-service", model: config.ollama }));

app.use("/ai", embedRoutes);
app.use("/ai", tagRoutes);

app.use((err, _req, res, _next) => {
  logger.error(err);
  res.status(500).json({ error: "internal error" });
});

app.listen(config.ports.ai, () => logger.info(`ai-service listening on :${config.ports.ai}`));
