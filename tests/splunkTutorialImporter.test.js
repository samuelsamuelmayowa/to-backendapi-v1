"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { readZipEntries, ZipSafetyError } = require("../utils/safeZip");
const { makeDatasetGroups } = require("../services/splunkTutorialImporter");
const { executeTutorialSearch } = require("../services/splunkTutorialSearch");
const { resultMode } = require("../services/splunkTutorialSearch");
const { assertSafeTutorialDatabaseUrl } = require("../utils/tutorialImportDatabase");
const SplunkLabDataset = require("../model/SplunkLabDataset");
const SplunkLabEvent = require("../model/SplunkLabEvent");

const dataDirectory = path.join(__dirname, "..", "data");
const tutorialZipPath = path.join(dataDirectory, "tutorialdata.zip");
const pricesZipPath = path.join(dataDirectory, "Prices.csv.zip");

test("tutorial import accepts only the isolated local development database", () => {
  assert.equal(
    assertSafeTutorialDatabaseUrl("mongodb://127.0.0.1:27017/to_analytics_lab"),
    "mongodb://127.0.0.1:27017/to_analytics_lab",
  );
  assert.equal(
    assertSafeTutorialDatabaseUrl("mongodb://localhost/to_analytics_lab"),
    "mongodb://localhost/to_analytics_lab",
  );
  for (const unsafeUrl of [
    undefined,
    "not-a-uri",
    "mongodb+srv://user:secret@cluster.example/prod",
    "mongodb://db.example:27017/to_analytics_lab",
    "mongodb://127.0.0.1:27017/production",
    "mongodb://user:secret@127.0.0.1:27017/to_analytics_lab",
    "mongodb://127.0.0.1:27018/to_analytics_lab",
    "mongodb://127.0.0.1:27017/to_analytics_lab?replicaSet=remote",
  ]) {
    assert.throws(() => assertSafeTutorialDatabaseUrl(unsafeUrl));
  }
});

test("safely reads only entries within the supplied tutorial ZIP", () => {
  const original = fs.readFileSync(tutorialZipPath);
  const entries = readZipEntries(original);
  assert.ok(entries.some((entry) => entry.name === "www1/access.log"));
  assert.ok(entries.some((entry) => entry.name === "vendor_sales/vendor_sales.log"));
  assert.throws(() => readZipEntries(Buffer.from("not a zip")), ZipSafetyError);
  assert.deepEqual(fs.readFileSync(tutorialZipPath), original, "the imported ZIP remains unchanged");
});

test("parses actual access, secure, vendor-sales, and Prices.csv records", () => {
  const tutorialZip = fs.readFileSync(tutorialZipPath);
  const pricesZip = fs.readFileSync(pricesZipPath);
  const groups = makeDatasetGroups(tutorialZip, pricesZip);
  const byIndex = Object.fromEntries(groups.map((group) => [group.index, group]));

  assert.equal(byIndex.buttercup_web.eventCount, 39532);
  assert.equal(byIndex.buttercup_auth.eventCount, 40088);
  assert.equal(byIndex.buttercup_sales.eventCount, 30244);
  assert.equal(byIndex.buttercup_prices.eventCount, 16);
  assert.equal(byIndex.buttercup_web.events[0].host, "www1");
  assert.equal(byIndex.buttercup_web.events[0].sourcetype, "access_combined");
  assert.equal(byIndex.buttercup_auth.events[0].sourcetype, "linux_secure");
  assert.equal(byIndex.buttercup_prices.events[0].price, 24.99);
  assert.ok(byIndex.buttercup_prices.fields.includes("productId"));
  assert.ok(byIndex.buttercup_auth.timestampRange.earliest < byIndex.buttercup_auth.timestampRange.latest);
});

test("computes real SPL search and statistics results from imported records", () => {
  const groups = makeDatasetGroups(fs.readFileSync(tutorialZipPath), fs.readFileSync(pricesZipPath));
  const byIndex = Object.fromEntries(groups.map((group) => [group.index, group]));
  const auth = byIndex.buttercup_auth;
  const failedLogins = executeTutorialSearch({
    query: "index=buttercup_auth action=failure | stats count by user",
    index: "buttercup_auth",
    dataset: auth.definition,
    events: auth.events,
  });
  assert.equal(failedLogins.status, "complete");
  assert.ok(failedLogins.scanned > 0);
  assert.ok(failedLogins.totalRows > 0);
  assert.ok(failedLogins.rows.every((row) => typeof row.count === "number"));

  const access = byIndex.buttercup_web;
  const errors = executeTutorialSearch({
    query: "index=buttercup_web status>=400 | stats count by status",
    index: "buttercup_web",
    dataset: access.definition,
    events: access.events,
  });
  assert.ok(errors.totalRows > 0);
  assert.ok(errors.rows.every((row) => Number(row.status) >= 400));

  const prices = byIndex.buttercup_prices;
  const priceCount = executeTutorialSearch({
    query: "index=buttercup_prices | stats count",
    index: "buttercup_prices",
    dataset: prices.definition,
    events: prices.events,
  });
  assert.equal(priceCount.rows[0].count, 16);
});

test("rejects unsupported ranges, missing indexes, and mismatched index access", () => {
  assert.throws(() => executeTutorialSearch({ query: "search failure", index: "buttercup_auth", dataset: {}, events: [] }), /index=buttercup_web/);
  assert.throws(() => executeTutorialSearch({ query: "index=other", index: "buttercup_auth", dataset: {}, events: [] }), /does not match/);
  assert.throws(() => executeTutorialSearch({ query: "index=buttercup_auth", index: "buttercup_auth", dataset: {}, events: [], timeRange: "30d" }), /supported time range/);
});

test("SPL eval uses arithmetic parsing and rejects JavaScript expressions", () => {
  const result = executeTutorialSearch({
    query: "index=buttercup_prices | eval sale_tax=round(sale_price*1.075,2) | table productId sale_tax",
    index: "buttercup_prices",
    dataset: { slug: "buttercup-prices", name: "Prices" },
    events: [{ _time: null, index: "buttercup_prices", productId: "TEST-1", sale_price: 10 }],
  });
  assert.equal(result.rows[0].sale_tax, 10.75);
  assert.throws(() => executeTutorialSearch({
    query: "index=buttercup_prices | eval result=process.exit()",
    index: "buttercup_prices",
    dataset: { slug: "buttercup-prices", name: "Prices" },
    events: [{ _time: null, index: "buttercup_prices" }],
  }), /Eval supports/);
});

test("stored-data search rejects unsupported commands before execution", () => {
  assert.throws(() => executeTutorialSearch({
    query: 'index=buttercup_web | rex field=_raw "(.*)+"',
    index: "buttercup_web",
    dataset: { slug: "buttercup-web", name: "Web" },
    events: [],
  }), /Command not supported by stored-data search yet: rex/);
});

test("result mode survives sorting after statistics and timecharts", () => {
  assert.equal(resultMode("index=buttercup_web | stats count by status | sort -count"), "statistics");
  assert.equal(resultMode("index=buttercup_web | timechart span=1h count | sort _time"), "timechart");
  assert.equal(resultMode("index=buttercup_web | stats count by status | table status count"), "table");
});

test("catalog and search controllers return records parsed from the supplied ZIPs", async () => {
  const groups = makeDatasetGroups(fs.readFileSync(tutorialZipPath), fs.readFileSync(pricesZipPath));
  const datasetsByIndex = new Map(groups.map((group) => [group.index, {
    ...group.definition,
    index: group.index,
    version: "fixture-version",
    eventCount: group.eventCount,
    fields: group.fields,
    sourcetypes: group.sourcetypes,
    sourceCategory: group.definition.category,
    timestampRange: group.timestampRange,
    dataOrigin: "Test-only copy of the supplied Splunk tutorial archive",
    isSynthetic: true,
    distributionStatus: "review_required",
    status: "ready",
  }]));
  const eventsBySlug = new Map(groups.map((group) => [group.definition.slug, group.events.map((event, index) => ({
    ...event,
    _id: `event-${index}`,
    datasetSlug: group.definition.slug,
    datasetVersion: "fixture-version",
  }))]));

  const originalDatasetFind = SplunkLabDataset.find;
  const originalDatasetFindOne = SplunkLabDataset.findOne;
  const originalEventFind = SplunkLabEvent.find;
  SplunkLabDataset.find = () => ({
    select() { return this; },
    sort() { return this; },
    lean: async () => [...datasetsByIndex.values()],
  });
  SplunkLabDataset.findOne = ({ index }) => ({ lean: async () => datasetsByIndex.get(index) || null });
  SplunkLabEvent.find = (filter) => ({
    limit() { return this; },
    maxTimeMS() { return this; },
    lean: async () => eventsBySlug.get(filter.datasetSlug) || [],
  });

  const controller = require("../controller/splunkSearch");
  const makeResponse = () => ({ statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });
  try {
    const catalogResponse = makeResponse();
    await controller.listCatalog({}, catalogResponse, (error) => { throw error; });
    assert.equal(catalogResponse.statusCode, 200);
    const catalog = catalogResponse.body.data;
    assert.equal(catalog.length, 4);
    assert.equal(catalog.find((dataset) => dataset.index === "buttercup_web").eventCount, 39532);

    const searchResponse = makeResponse();
    await controller.search({ splunkStudent: { ownerId: "507f1f77bcf86cd799439011" }, skipSearchHistory: true, body: {
        query: "index=buttercup_web status>=400 | stats count by status",
        timeRange: "all",
        page: 1,
        pageSize: 20,
      } }, searchResponse, (error) => { throw error; });
    assert.equal(searchResponse.statusCode, 200);
    const result = searchResponse.body.data;
    assert.equal(result.status, "complete");
    assert.equal(result.scanned, 39532);
    assert.ok(result.totalRows > 0);
    assert.ok(result.rows.every((row) => row.status >= 400 && Number.isFinite(row.count)));
  } finally {
    SplunkLabDataset.find = originalDatasetFind;
    SplunkLabDataset.findOne = originalDatasetFindOne;
    SplunkLabEvent.find = originalEventFind;
  }
});
