"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { buildSyntheticTrainingData, FULL_DATASET_COUNTS, seedSyntheticTrainingData } = require("../services/splunkSyntheticDataset");
const { assertSafeStagingDatabaseUrl, STAGING_CONFIRMATION } = require("../utils/stagingSplunkDatabase");
const { executeTutorialSearch } = require("../services/splunkTutorialSearch");
const { isTrainingStoreReady, trainingStoreUnavailableError } = require("../services/splunkTrainingStore");
const { EXPECTED_COUNTS, requireRightsAuthorization } = require("../scripts/migrateApprovedButtercupToStaging");

test("builds deterministic original datasets and supports SPL training searches", () => {
  assert.equal(Object.values(FULL_DATASET_COUNTS).reduce((sum, count) => sum + count, 0), 109880);
  const data = buildSyntheticTrainingData();
  assert.deepEqual(data.map(({ dataset, events }) => [dataset.index, events.length]), [["toa_web", 39532], ["toa_auth", 40088], ["toa_sales", 30244], ["toa_prices", 16]]);
  assert.match(data[0].events[0]._id, /^[a-f0-9]{24}$/);
  assert.equal(data[0].events[0]._id, buildSyntheticTrainingData(2)[0].events[0]._id);
  assert.deepEqual(buildSyntheticTrainingData(2)[0].events, buildSyntheticTrainingData(2)[0].events);
  const web = data[0];
  const allWeb = executeTutorialSearch({ query: "index=toa_web | stats count", index: "toa_web", dataset: web.dataset, events: web.events, timeRange: "all", now: Date.UTC(2026, 0, 1) });
  assert.equal(allWeb.rows[0].count, 39532);
  const stats = executeTutorialSearch({ query: "index=toa_web status>=400 | stats count by status | sort -count", index: "toa_web", dataset: web.dataset, events: web.events, timeRange: "all", now: Date.UTC(2026, 0, 1) });
  assert.equal(stats.rows.reduce((sum, row) => sum + row.count, 0), 13177);
  assert.deepEqual(stats.rows.map((row) => row.status), [404, 500]);
  const smallData = buildSyntheticTrainingData(120);
  const auth = smallData[1];
  const authStats = executeTutorialSearch({ query: 'index=toa_auth action=failure | stats count by action', index: "toa_auth", dataset: auth.dataset, events: auth.events, timeRange: "all", now: Date.UTC(2026, 0, 1) });
  assert.equal(authStats.rows[0].count, 30);
  const sales = smallData[2];
  const salesStats = executeTutorialSearch({ query: "index=toa_sales | stats count by VendorID", index: "toa_sales", dataset: sales.dataset, events: sales.events, timeRange: "all", now: Date.UTC(2026, 0, 1) });
  assert.equal(salesStats.rows.reduce((sum, row) => sum + row.count, 0), 120);
});

test("staging URL guard requires exact isolated remote database and explicit confirmation", () => {
  const url = "mongodb+srv://user:pass@staging-cluster.example.net/toa_splunk_staging";
  assert.deepEqual(assertSafeStagingDatabaseUrl(url, STAGING_CONFIRMATION, "staging-cluster.example.net"), { hostname: "staging-cluster.example.net", database: "toa_splunk_staging" });
  for (const url of [
    "mongodb://127.0.0.1:27017/toa_splunk_staging",
    "mongodb+srv://user:pass@prod-cluster.example.net/toa_splunk_staging",
    "mongodb+srv://user:pass@staging-cluster.example.net/to_analytics_lab",
  ]) assert.throws(() => assertSafeStagingDatabaseUrl(url, STAGING_CONFIRMATION, "staging-cluster.example.net"));
  assert.throws(() => assertSafeStagingDatabaseUrl(url, STAGING_CONFIRMATION, "wrong-host.example.net"), /exact approved staging/);
  assert.throws(() => assertSafeStagingDatabaseUrl(url, "", "staging-cluster.example.net"), /Set TOA_SPLUNK_STAGING_CONFIRM/);
});

test("staging seeder uses idempotent event upserts and touches only synthetic index names", async () => {
  const calls = { datasets: [], writes: [], idsByIndex: new Map() };
  const Dataset = { updateOne: async (...args) => calls.datasets.push(args) };
  const Event = {
    bulkWrite: async (operations, options) => {
      calls.writes.push([operations, options]);
      for (const { updateOne } of operations) {
        const event = updateOne.update.$setOnInsert;
        const ids = calls.idsByIndex.get(event.index) || new Set();
        ids.add(event._id);
        calls.idsByIndex.set(event.index, ids);
      }
    },
    countDocuments: (filter) => ({ exec: async () => calls.idsByIndex.get(filter.index)?.size || 0 }),
  };
  const first = await seedSyntheticTrainingData({ Dataset, Event, eventsPerDataset: 3 });
  const second = await seedSyntheticTrainingData({ Dataset, Event, eventsPerDataset: 3 });
  assert.deepEqual(first, second);
  assert.equal(calls.datasets.length, 16);
  assert.equal(calls.writes.length, 8);
  assert.equal(calls.writes[0][0].length, 3);
  assert.ok(calls.writes[0][0].every((operation) => operation.updateOne.upsert && operation.updateOne.update.$setOnInsert));
  assert.deepEqual(calls.datasets.map(([filter]) => filter.index), ["toa_web", "toa_web", "toa_auth", "toa_auth", "toa_sales", "toa_sales", "toa_prices", "toa_prices", "toa_web", "toa_web", "toa_auth", "toa_auth", "toa_sales", "toa_sales", "toa_prices", "toa_prices"]);
});

test("dedicated training database does not silently fall back when disconnected", () => {
  const previous = process.env.SPLUNK_TRAINING_DATABASE_URL;
  process.env.SPLUNK_TRAINING_DATABASE_URL = "mongodb+srv://stage.example.net/toa_splunk_staging";
  try {
    assert.equal(isTrainingStoreReady(), false);
    assert.equal(trainingStoreUnavailableError().status, 503);
    assert.match(trainingStoreUnavailableError().message, /stored training dataset service is not connected/);
  } finally {
    if (previous === undefined) delete process.env.SPLUNK_TRAINING_DATABASE_URL;
    else process.env.SPLUNK_TRAINING_DATABASE_URL = previous;
  }
});

test("Buttercup migration requires a recorded written redistribution authorization", () => {
  assert.equal(Object.values(EXPECTED_COUNTS).reduce((sum, count) => sum + count, 0), 109880);
  assert.throws(() => requireRightsAuthorization({}), /written redistribution authorization/);
  assert.throws(() => requireRightsAuthorization({ TOA_BUTTERCUP_RIGHTS_CONFIRMATION: "written-redistribution-authorization-confirmed" }), /written redistribution authorization/);
  assert.doesNotThrow(() => requireRightsAuthorization({
    TOA_BUTTERCUP_RIGHTS_CONFIRMATION: "written-redistribution-authorization-confirmed",
    TOA_BUTTERCUP_RIGHTS_REFERENCE: "legal-ticket-123",
  }));
});
