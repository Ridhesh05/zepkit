#!/usr/bin/env node
/**
 * Seed dark stores + products. Wipes product data first (idempotent re-runs). Tags are rule-only
 * (instant, no LLM); the worker embeds + indexes each. Products go through the real API pipeline.
 *   node scripts/seed.js
 */
import { config, getDb, getRedis, closeMongo, closeRedis, logger } from "@zepkit/common";
import { ruleOnly, splitTags } from "../services/ai-service/src/tagEngine.js";
import { resetCollection } from "../infra/typesense/schema.js";

const API = `http://localhost:${config.ports.api}/products`;
const TARGET = 250;

const STORES = [
  { _id: "S1", name: "Mumbai", servicePincodes: ["400001", "400050", "400053", "400069"], geo: { lat: 19.076, lng: 72.877 } },
  { _id: "S2", name: "Delhi", servicePincodes: ["110001", "110002", "110005", "110019"], geo: { lat: 28.644, lng: 77.216 } },
  { _id: "S3", name: "Bengaluru", servicePincodes: ["560001", "560002", "560034", "560066"], geo: { lat: 12.972, lng: 77.594 } },
  { _id: "S4", name: "Pune", servicePincodes: ["411001", "411004", "411014", "411045"], geo: { lat: 18.52, lng: 73.857 } },
  { _id: "S5", name: "Ahmedabad", servicePincodes: ["380001", "380006", "380015", "380054"], geo: { lat: 23.023, lng: 72.571 } },
  { _id: "S6", name: "Surat", servicePincodes: ["395001", "395003", "395007", "395009"], geo: { lat: 21.17, lng: 72.831 } },
  { _id: "S7", name: "Hyderabad", servicePincodes: ["500001", "500032", "500081", "500084"], geo: { lat: 17.385, lng: 78.487 } },
  { _id: "S8", name: "Kolkata", servicePincodes: ["700001", "700019", "700091", "700156"], geo: { lat: 22.573, lng: 88.364 } },
];

const DEFS = [
  { cat: "salt", label: "Salt", brands: ["Tata", "Annapurna", "Catch", "Nirma"], sizes: ["1kg", "500g", "2kg"], prices: [22, 14, 42] },
  { cat: "milk", label: "Milk", brands: ["Amul", "Mother Dairy", "Nandini", "Gokul"], sizes: ["500ml", "1L", "250ml"], prices: [29, 56, 15] },
  { cat: "atta", label: "Atta", brands: ["Aashirvaad", "Pillsbury", "Fortune"], sizes: ["5kg", "1kg", "10kg"], prices: [255, 58, 495] },
  { cat: "rice", label: "Basmati Rice", brands: ["India Gate", "Daawat", "Fortune", "Kohinoor"], sizes: ["1kg", "5kg"], prices: [95, 440] },
  { cat: "sugar", label: "Sugar", brands: ["Madhur", "Dhampure", "Trust"], sizes: ["1kg", "5kg"], prices: [45, 215] },
  { cat: "tea", label: "Tea", brands: ["Tata", "Red Label", "Taj Mahal", "Wagh Bakri"], sizes: ["250g", "500g", "1kg"], prices: [130, 250, 480] },
  { cat: "biscuit", label: "Biscuits", brands: ["Parle", "Britannia", "Sunfeast", "Oreo"], sizes: ["100g", "250g"], prices: [10, 35] },
  { cat: "soap", label: "Soap", brands: ["Lux", "Lifebuoy", "Dove", "Santoor", "Medimix"], sizes: ["100g", "125g"], prices: [35, 45] },
  { cat: "shampoo", label: "Shampoo", brands: ["Dove", "Clinic Plus", "Sunsilk", "Pantene"], sizes: ["180ml", "340ml"], prices: [120, 210] },
  { cat: "potato", label: "Aloo", brands: ["Fresh", "Farm", "Organic"], sizes: ["1kg", "2kg", "500g"], prices: [30, 55, 18] },
  { cat: "oil", label: "Oil", brands: ["Fortune", "Saffola", "Dhara", "Sundrop", "Gemini"], sizes: ["1L", "5L"], prices: [140, 650] },
  { cat: "bread", label: "Bread", brands: ["Britannia", "Harvest", "Modern"], sizes: ["400g"], prices: [45] },
  { cat: "paneer", label: "Paneer", brands: ["Amul", "Mother Dairy", "Gowardhan", "ID"], sizes: ["200g", "500g"], prices: [85, 199] },
  { cat: "curd", label: "Dahi", brands: ["Amul", "Mother Dairy", "Nestle"], sizes: ["400g", "1kg"], prices: [35, 75] },
  { cat: "noodles", label: "Noodles", brands: ["Maggi", "Yippee", "Top Ramen", "Knorr"], sizes: ["70g", "280g"], prices: [14, 48] },
  { cat: "namkeen", label: "Namkeen", brands: ["Haldiram", "Bikaji", "Bikano", "Lehar"], sizes: ["150g", "400g"], prices: [45, 110] },
  { cat: "chips", label: "Chips", brands: ["Lays", "Bingo", "Kurkure", "Uncle Chipps"], sizes: ["52g", "90g"], prices: [20, 35] },
  { cat: "chocolate", label: "Chocolate", brands: ["Cadbury", "Nestle", "Amul", "KitKat"], sizes: ["50g", "100g"], prices: [40, 90] },
  { cat: "softdrink", label: "Cold Drink", brands: ["Coca Cola", "Pepsi", "Sprite", "Thums Up", "Fanta"], sizes: ["750ml", "2L"], prices: [40, 95] },
  { cat: "water", label: "Water", brands: ["Bisleri", "Kinley", "Aquafina", "Bailley"], sizes: ["1L", "2L"], prices: [20, 30] },
  { cat: "detergent", label: "Detergent", brands: ["Surf Excel", "Ariel", "Tide", "Rin", "Ghadi"], sizes: ["1kg", "2kg"], prices: [120, 230] },
  { cat: "toothpaste", label: "Toothpaste", brands: ["Colgate", "Closeup", "Pepsodent", "Dabur", "Sensodyne"], sizes: ["100g", "200g"], prices: [55, 99] },
  { cat: "coffee", label: "Coffee", brands: ["Nescafe", "Bru", "Sunrise"], sizes: ["50g", "200g"], prices: [150, 490] },
  { cat: "ghee", label: "Ghee", brands: ["Amul", "Patanjali", "Gowardhan", "Mother Dairy"], sizes: ["500ml", "1L"], prices: [320, 630] },
  { cat: "honey", label: "Honey", brands: ["Dabur", "Patanjali", "Apis", "Zandu"], sizes: ["250g", "500g"], prices: [150, 280] },
  { cat: "butter", label: "Butter", brands: ["Amul", "Britannia", "Nutralite"], sizes: ["100g", "500g"], prices: [52, 235] },
  { cat: "tomato", label: "Tamatar", brands: ["Fresh", "Farm", "Organic"], sizes: ["1kg", "500g"], prices: [35, 18] },
  { cat: "cream", label: "Fresh Cream", brands: ["Amul", "Nestle", "Britannia"], sizes: ["200ml", "1L"], prices: [60, 250] },
];

const rnd = (n) => Math.floor(Math.random() * n);
const pick = (arr, k) => [...arr].sort(() => Math.random() - 0.5).slice(0, k);

function inventoryFor(base) {
  const stores = pick(STORES, 2 + rnd(4)); // 2..5 stores
  const inv = stores.map((s) => ({
    storeId: s._id,
    stock: rnd(200),
    price: Math.round(base * (0.9 + Math.random() * 0.25)),
  }));
  if (!inv.some((i) => i.stock > 0)) inv[0].stock = 10 + rnd(190);
  return inv;
}

function buildProducts() {
  const out = [];
  for (const d of DEFS) {
    for (const brand of d.brands) {
      for (let si = 0; si < d.sizes.length; si++) {
        const title = `${brand} ${d.label} ${d.sizes[si]}`;
        const r = ruleOnly(title);
        const { tags, aliases } = splitTags(r.flat);
        out.push({ title, category: r.category, veg: true, unit: d.sizes[si], tags, aliases, inventory: inventoryFor(d.prices[si]) });
      }
    }
  }
  return out.sort(() => Math.random() - 0.5).slice(0, TARGET);
}

async function post(product) {
  const res = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Admin-Key": config.adminKey },
    body: JSON.stringify(product),
  });
  if (!res.ok) throw new Error(`POST ${res.status}: ${(await res.text()).slice(0, 120)}`);
  return res.json();
}

(async () => {
  const db = await getDb();

  // wipe product data (keep search_logs), reset search index + cache
  await db.collection("products").deleteMany({});
  await db.collection("inventory").deleteMany({});
  await db.collection("dark_stores").deleteMany({});
  await resetCollection();
  await getRedis().flushdb();
  logger.info("cleared products / inventory / stores / index / cache");

  await Promise.all(STORES.map((s) => db.collection("dark_stores").updateOne({ _id: s._id }, { $set: s }, { upsert: true })));
  logger.info(`seeded ${STORES.length} dark stores`);

  const products = buildProducts();
  let ok = 0;
  for (const p of products) {
    try { await post(p); ok++; } catch (e) { logger.error(`failed "${p.title}": ${e.message}`); }
  }
  logger.info(`posted ${ok}/${products.length} products (worker is indexing them async)`);
  await closeMongo();
  await closeRedis();
  process.exit(0);
})().catch((e) => {
  logger.error("seed failed:", e.message);
  process.exit(1);
});
