// Load test for the ZepKit search API.
//   brew install k6   (once)
//   RATE=50 DURATION=30s ADMIN_KEY=zepkit-admin-2024 k6 run k6/search-load.js
// Hits /search at RATE requests/sec with a multilingual query mix across all stores,
// then POSTs the throughput + latency summary to the admin dashboard automatically.
import http from "k6/http";
import { check } from "k6";
import { textSummary } from "https://jslib.k6.io/k6-summary/0.0.1/index.js";

const API = __ENV.API_URL || "http://localhost:4000";
const ADMIN_KEY = __ENV.ADMIN_KEY || "zepkit-admin-2024";
const RATE = Number(__ENV.RATE || 50); // target searches/sec
const DURATION = __ENV.DURATION || "30s";

const STORES = ["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8"];
const QUERIES = [
  "aloo", "doodh", "आलू", "maggi", "chai", "chips", "paneer", "thanda", "sabun", "আলু",
  "tamatar", "cold drink", "amul doodh 60 se kam", "mujhe chai peeni hai", "namak",
  "bread", "shampoo", "ghee", "honey", "coffee", "biscuit", "rice", "sugar",
];

export const options = {
  scenarios: {
    search: {
      executor: "constant-arrival-rate",
      rate: RATE,
      timeUnit: "1s",
      duration: DURATION,
      preAllocatedVUs: Math.max(20, RATE),
      maxVUs: Math.max(50, RATE * 4),
    },
  },
  summaryTrendStats: ["avg", "min", "med", "p(90)", "p(95)", "p(99)", "max"],
  thresholds: {
    http_req_duration: ["p(95)<2000"],
    http_req_failed: ["rate<0.05"],
  },
};

export default function () {
  const q = QUERIES[Math.floor(Math.random() * QUERIES.length)];
  const s = STORES[Math.floor(Math.random() * STORES.length)];
  const res = http.get(`${API}/search?q=${encodeURIComponent(q)}&store=${s}`);
  check(res, { "status 200": (r) => r.status === 200 });
}

export function handleSummary(data) {
  const d = data.metrics.http_req_duration.values;
  const run = {
    ts: new Date().toISOString(),
    rateTarget: RATE,
    duration: DURATION,
    reqsPerSec: Math.round(data.metrics.http_reqs.values.rate * 10) / 10,
    totalReqs: data.metrics.http_reqs.values.count,
    avg: Math.round(d.avg),
    p50: Math.round(d.med),
    p95: Math.round(d["p(95)"]),
    p99: Math.round(d["p(99)"]),
    max: Math.round(d.max),
    errorRate: Math.round(data.metrics.http_req_failed.values.rate * 10000) / 100,
    vus: data.metrics.vus_max ? data.metrics.vus_max.values.max : null,
  };
  let posted = "could not POST to dashboard";
  try {
    const r = http.post(`${API}/admin/loadtest`, JSON.stringify(run), {
      headers: { "Content-Type": "application/json", "X-Admin-Key": ADMIN_KEY },
    });
    posted = r.status === 200 ? "saved to admin dashboard ✓" : `dashboard POST → ${r.status}`;
  } catch (e) {
    posted = `dashboard POST failed: ${e}`;
  }
  return {
    stdout: "\n" + textSummary(data, { indent: " ", enableColors: true }) +
      `\n\n→ ${run.reqsPerSec}/s · p50 ${run.p50}ms · p95 ${run.p95}ms · p99 ${run.p99}ms · err ${run.errorRate}%\n→ ${posted}\n`,
  };
}
