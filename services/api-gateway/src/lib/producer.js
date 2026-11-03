import { getKafka, config } from "@zepkit/common";

let producer;

export async function getProducer() {
  if (!producer) {
    producer = getKafka().producer();
    await producer.connect();
  }
  return producer;
}

export async function publish(event) {
  const p = await getProducer();
  await p.send({
    topic: config.kafka.ingestTopic,
    messages: [{ key: event.payload._id, value: JSON.stringify(event) }],
  });
}

export async function closeProducer() {
  if (producer) await producer.disconnect();
  producer = undefined;
}
