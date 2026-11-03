import { MongoClient } from "mongodb";
import { config } from "../config.js";

let client;
let db;

export async function getDb() {
  if (db) return db;
  client = new MongoClient(config.mongo.uri);
  await client.connect();
  db = client.db(config.mongo.db);
  return db;
}

export async function closeMongo() {
  if (client) await client.close();
  client = undefined;
  db = undefined;
}
