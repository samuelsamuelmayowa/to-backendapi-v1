"use strict";

require("dotenv").config();
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const Dataset = require("../model/SplunkLabDataset");
const Event = require("../model/SplunkLabEvent");
const { runStoredSPL } = require("../services/splunkStudentSearch");
const { assertSafeStagingDatabaseUrl } = require("../utils/stagingSplunkDatabase");

const expectedCounts = { toa_web: 39532, toa_auth: 40088, toa_sales: 30244, toa_prices: 16 };

async function main() {
  const target = assertSafeStagingDatabaseUrl(process.env.TOA_SPLUNK_STAGING_DATABASE_URL, process.env.TOA_SPLUNK_STAGING_CONFIRM, process.env.TOA_SPLUNK_STAGING_ALLOWED_HOST);
  await mongoose.connect(process.env.TOA_SPLUNK_STAGING_DATABASE_URL, { serverSelectionTimeoutMS: 10000 });
  await Promise.all([Dataset.createIndexes(), Event.createIndexes()]);

  const datasets = await Dataset.find({ status: "ready" }).select("slug index eventCount version").sort({ index: 1 }).lean();
  assert.deepEqual(datasets.map(({ index }) => index), Object.keys(expectedCounts).sort());
  for (const dataset of datasets) {
    const actual = await Event.countDocuments({ index: dataset.index, datasetSlug: dataset.slug, datasetVersion: dataset.version }).exec();
    assert.equal(actual, expectedCounts[dataset.index], `${dataset.index} catalog count must match stored events`);
    assert.equal(dataset.eventCount, actual, `${dataset.index} catalog metadata must match stored events`);
  }

  const indexes = await Event.collection.indexes();
  assert.ok(indexes.some((item) => item.key.index === 1 && item.key.datasetSlug === 1 && item.key.datasetVersion === 1 && item.key._time === 1), "the dataset/time compound index is present");
  assert.ok(indexes.some((item) => item.key.index === 1 && item.key.datasetSlug === 1 && item.key.datasetVersion === 1 && item.key.sourcetype === 1), "the dataset/sourcetype compound index is present");

  const count = await runStoredSPL("index=toa_web | stats count", { timeRange: "all" });
  assert.equal(count.rows[0].count, 39532);
  assert.equal(count.scanned, 39532);
  const webStats = await runStoredSPL("index=toa_web status>=400 | stats count by status | sort -count", { timeRange: "all" });
  assert.equal(webStats.rows.reduce((sum, row) => sum + row.count, 0), 13177);
  const authStats = await runStoredSPL("index=toa_auth action=failure | stats count by user | sort -count", { timeRange: "all" });
  assert.equal(authStats.rows.reduce((sum, row) => sum + row.count, 0), 10022);
  const salesStats = await runStoredSPL("index=toa_sales | stats count by VendorID", { timeRange: "all" });
  assert.equal(salesStats.rows.reduce((sum, row) => sum + row.count, 0), 30244);
  const prices = await runStoredSPL("index=toa_prices | table productId product_name price sale_price", { timeRange: "all" });
  assert.equal(prices.totalRows, 16);

  const page1 = await runStoredSPL("index=toa_web | table _time status endpoint", { timeRange: "all", page: 1, pageSize: 100 });
  const page2 = await runStoredSPL("index=toa_web | table _time status endpoint", { timeRange: "all", page: 2, pageSize: 100 });
  assert.equal(page1.totalRows, 39532);
  assert.equal(page1.rows.length, 100);
  assert.equal(page2.rows.length, 100);
  assert.notDeepEqual(page1.rows[0], page2.rows[0]);
  const sevenDays = await runStoredSPL("index=toa_web | stats count", { timeRange: "7d" });
  assert.ok(sevenDays.scanned <= count.scanned);
  await assert.rejects(runStoredSPL("index=toa_web | rex field=_raw '(.*)'", { timeRange: "all" }), /not supported/);

  console.log("Staging catalog, 109,880 event counts, indexes, SPL statistics, All Time, bounded time filtering, pagination, and unsupported-command handling verified.");
  console.log(`Verified staging database: ${target.database} on ${target.hostname}.`);
}

main().catch((error) => { console.error(`Staging data verification failed (${error.name || "Error"}). Review private staging logs without sharing connection strings or credentials.`); process.exitCode = 1; })
  .finally(async () => { if (mongoose.connection.readyState) await mongoose.disconnect(); });
