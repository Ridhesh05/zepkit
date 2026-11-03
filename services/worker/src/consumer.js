import { getKafka, config, logger } from "@zepkit/common";
import { handle } from "./handlers/index.js";
import { toDLQ } from "./dlq.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MAX_ATTEMPTS = 3;

export async function startConsumer() {
  const consumer = getKafka().consumer({ groupId: config.kafka.groupId });
  await consumer.connect();
  await consumer.subscribe({ topic: config.kafka.ingestTopic, fromBeginning: false });
  logger.info(`worker consuming "${config.kafka.ingestTopic}" as group "${config.kafka.groupId}"`);

  // autoCommit (default) commits the offset only after eachMessage resolves — which happens after
  // all three stores are written, or after the event is parked on the DLQ. That is our
  // "offset after all writes" guarantee.
  await consumer.run({
    eachMessage: async ({ message }) => {
      let event;
      try {
        event = JSON.parse(message.value.toString());
      } catch {
        logger.error("skipping unparseable message");
        return;
      }
      let lastErr;
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
          await handle(event);
          return;
        } catch (e) {
          lastErr = e;
          logger.warn(`handle failed (attempt ${attempt}/${MAX_ATTEMPTS}) for ${event.payload?._id}: ${e.message}`);
          if (attempt < MAX_ATTEMPTS) await sleep(attempt * 500);
        }
      }
      logger.error(`→ DLQ for ${event.payload?._id}: ${lastErr.message}`);
      await toDLQ(event, lastErr);
    },
  });

  return consumer;
}
