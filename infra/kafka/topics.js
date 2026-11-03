import { getKafka, config, logger } from "@zepkit/common";

export async function ensureTopics() {
  const admin = getKafka().admin();
  await admin.connect();
  try {
    const existing = await admin.listTopics();
    const wanted = [config.kafka.ingestTopic, config.kafka.dlqTopic].filter((t) => !existing.includes(t));
    if (wanted.length) {
      await admin.createTopics({
        topics: wanted.map((topic) => ({ topic, numPartitions: 3, replicationFactor: 1 })),
      });
      logger.info(`Kafka topics created: ${wanted.join(", ")}`);
    } else {
      logger.info("Kafka topics already exist");
    }
  } finally {
    await admin.disconnect();
  }
}
