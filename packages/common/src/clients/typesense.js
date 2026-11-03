import Typesense from "typesense";
import { config } from "../config.js";

let client;

export function getTypesense() {
  if (!client) {
    client = new Typesense.Client({
      nodes: [{ host: config.typesense.host, port: config.typesense.port, protocol: config.typesense.protocol }],
      apiKey: config.typesense.apiKey,
      connectionTimeoutSeconds: 5,
    });
  }
  return client;
}
