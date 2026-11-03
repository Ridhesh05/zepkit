import { logger } from "@zepkit/common";
import { startConsumer } from "./consumer.js";

startConsumer().catch((e) => {
  logger.error("worker failed to start:", e.message);
  process.exit(1);
});
