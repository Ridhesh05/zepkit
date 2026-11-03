import { Kafka, logLevel } from "kafkajs";
import { config } from "../config.js";

let kafka;

export function getKafka() {
  if (!kafka) {
    kafka = new Kafka({
      clientId: config.kafka.clientId,
      brokers: config.kafka.brokers,
      logLevel: logLevel.NOTHING,
    });
  }
  return kafka;
}
