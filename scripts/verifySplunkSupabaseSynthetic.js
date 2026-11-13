"use strict";

require("dotenv").config();
process.env.SPLUNK_TRAINING_STORE = "supabase";

const assert = require("node:assert/strict");
const store = require("../services/splunkSupabaseTrainingStore");
const { runStoredSPL } = require("../services/splunkStudentSearch");
const { FULL_DATASET_COUNTS, VERSION } = require("../services/splunkSyntheticDataset");

async function main() {
  await store.initialize();
  const catalog = await store.listCatalog();
  assert.deepEqual(catalog.map(({ index }) => index).sort(), Object.keys(FULL_DATASET_COUNTS).sort());
  for (const dataset of catalog) {
    assert.equal(dataset.isSynthetic, true, `${dataset.index} is synthetic`);
    assert.equal(dataset.eventCount, FULL_DATASET_COUNTS[dataset.index], `${dataset.index} catalog metadata count`);
    assert.equal(dataset.version, VERSION);
    assert.equal(await store.countEvents(dataset, null, Date.now()), FULL_DATASET_COUNTS[dataset.index], `${dataset.index} stored count`);
  }
  for (const [index, expected] of Object.entries(FULL_DATASET_COUNTS)) {
    const result = await runStoredSPL(`index=${index} | stats count`, { timeRange: "all" });
    assert.equal(result.rows[0].count, expected, `${index} SPL stats count`);
  }
  const page1 = await runStoredSPL("index=toa_web | table _time status endpoint", { timeRange: "all", page: 1, pageSize: 50 });
  const page2 = await runStoredSPL("index=toa_web | table _time status endpoint", { timeRange: "all", page: 2, pageSize: 50 });
  assert.equal(page1.totalRows, FULL_DATASET_COUNTS.toa_web);
  assert.equal(page1.rows.length, 50);
  assert.notDeepEqual(page1.rows[0], page2.rows[0]);
  const sevenDays = await runStoredSPL("index=toa_web | stats count", { timeRange: "7d" });
  assert.equal(sevenDays.scanned, 0, "the synthetic tutorial timestamps are historical and should be outside 7d");
  await assert.rejects(runStoredSPL("index=toa_web | rex field=_raw '(.*)'", { timeRange: "all" }), /not supported/);
  console.log("Supabase catalog, synthetic dataset identity, 109,880 exact records, SPL counts, time filtering, pagination, and unsupported command handling verified.");
}

main().catch((error) => {
  const safeCode = /^[A-Z0-9_-]{1,32}$/i.test(String(error.cause?.code || "")) ? error.cause.code : "unavailable";
  console.error(`Supabase synthetic verification failed: ${error.message || "Unknown error"} (safe error code: ${safeCode}). Private backend credentials are not printed.`);
  process.exitCode = 1;
});
