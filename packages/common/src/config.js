import "dotenv/config";

export const config = {
  ollama: {
    baseUrl: process.env.OLLAMA_BASE_URL || "http://localhost:11434",
    llmModel: process.env.LLM_MODEL || "gemma3:latest",
    embedModel: process.env.EMBED_MODEL || "bge-m3",
    embedDim: Number(process.env.EMBED_DIM || 1024),
  },
  kafka: {
    brokers: (process.env.KAFKA_BROKERS || "localhost:9092").split(","),
    clientId: process.env.KAFKA_CLIENT_ID || "zepkit",
    ingestTopic: process.env.KAFKA_INGEST_TOPIC || "products.ingest",
    dlqTopic: process.env.KAFKA_DLQ_TOPIC || "products.ingest.dlq",
    groupId: process.env.KAFKA_GROUP_ID || "product-worker",
  },
  typesense: {
    host: process.env.TYPESENSE_HOST || "localhost",
    port: Number(process.env.TYPESENSE_PORT || 8108),
    protocol: process.env.TYPESENSE_PROTOCOL || "http",
    apiKey: process.env.TYPESENSE_API_KEY || "zepkit-dev-key",
    collection: process.env.TYPESENSE_COLLECTION || "products",
  },
  redis: { url: process.env.REDIS_URL || "redis://localhost:6379" },
  mongo: {
    uri: process.env.MONGO_URI || "mongodb://localhost:27017",
    db: process.env.MONGO_DB || "zepkit",
  },
  aiService: { url: process.env.AI_SERVICE_URL || "http://localhost:4001" },
  adminKey: process.env.ADMIN_KEY || "zepkit-admin-2024",
  ports: {
    ai: Number(process.env.AI_SERVICE_PORT || 4001),
    api: Number(process.env.API_GATEWAY_PORT || 4000),
  },
};
