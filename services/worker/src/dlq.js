import { getKafka, config } from "@zepkit/common";

let producer;
async function getProducer() {
  if (!producer) {
    producer = getKafka().producer();
    await producer.connect();
  }
  return producer;
}

// After retries are exhausted, park the event (with the error) on the DLQ for manual replay.
export async function toDLQ(event, error) {
  const p = await getProducer();
  await p.send({
    topic: config.kafka.dlqTopic,
    messages: [{ key: event.payload?._id ?? null, value: JSON.stringify({ event, error: String(error), failedAt: new Date().toISOString() }) }],
  });
}
