"use strict";

require("dotenv").config();
const assert = require("node:assert/strict");
const express = require("express");
const mongoose = require("mongoose");
const SplunkLabDataset = require("../model/SplunkLabDataset");
const SplunkLabEvent = require("../model/SplunkLabEvent");
const { assertSafeTutorialDatabaseUrl } = require("../utils/tutorialImportDatabase");

const expected = [
  { index: "buttercup_web", slug: "buttercup-web", count: 39532 },
  { index: "buttercup_auth", slug: "buttercup-auth", count: 40088 },
  { index: "buttercup_sales", slug: "buttercup-sales", count: 30244 },
  { index: "buttercup_prices", slug: "buttercup-prices", count: 16 },
];
const expectedTotal = expected.reduce((sum, item) => sum + item.count, 0);

async function main() {
  const databaseUrl = assertSafeTutorialDatabaseUrl(process.env.DATABASE_URL);
  await mongoose.connect(databaseUrl);

  const server = express();
  server.use(express.json());
  server.use("/api/splunk-lab", require("../routes/splunkLab").createForTests({
    studentAuth: (req, res, next) => { req.splunkStudent = { ownerId: "507f1f77bcf86cd799439011" }; req.skipSearchHistory = true; next(); },
  }));
  const httpServer = server.listen(0, "127.0.0.1");

  try {
    await new Promise((resolve, reject) => {
      httpServer.once("listening", resolve);
      httpServer.once("error", reject);
    });
    const baseUrl = `http://127.0.0.1:${httpServer.address().port}/api/splunk-lab`;
    const get = async (path) => {
      const response = await fetch(`${baseUrl}${path}`);
      const body = await response.json();
      assert.equal(response.status, 200, body.message || `GET ${path} failed`);
      return body.data;
    };
    const post = async (path, payload) => {
      const response = await fetch(`${baseUrl}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json();
      assert.equal(response.status, 200, body.message || `POST ${path} failed`);
      return body.data;
    };

    const catalog = await get("/catalog");
    assert.equal(catalog.length, expected.length, "catalog should contain four imported datasets");
    for (const item of expected) {
      const dataset = catalog.find((entry) => entry.index === item.index);
      assert.ok(dataset, `catalog is missing ${item.index}`);
      assert.equal(dataset.eventCount, item.count, `${item.index} catalog count mismatch`);
      assert.equal(dataset.status, undefined, "internal import status should not be exposed");
      const activeCount = await SplunkLabEvent.countDocuments({
        index: item.index,
        datasetSlug: item.slug,
        datasetVersion: (await SplunkLabDataset.findOne({ slug: item.slug }).select("version").lean()).version,
      });
      assert.equal(activeCount, item.count, `${item.index} stored event count mismatch`);
      console.log(`${item.index}: catalog ${dataset.eventCount.toLocaleString()}, stored ${activeCount.toLocaleString()}`);
    }
    const totalStored = await SplunkLabEvent.countDocuments({});
    assert.equal(totalStored, expectedTotal, "event collection contains unexpected duplicates or stale versions");

    const firstPage = await post("/search", {
      query: "index=buttercup_web",
      timeRange: "all",
      page: 1,
      pageSize: 10,
    });
    assert.equal(firstPage.scanned, 39532);
    assert.equal(firstPage.totalRows, 39532);
    assert.equal(firstPage.rows.length, 10);
    assert.equal(firstPage.totalPages, 3954);
    assert.ok(firstPage.rows[0]._raw, "event results should contain the stored raw log line");

    const secondPage = await post("/search", {
      query: "index=buttercup_web",
      timeRange: "all",
      page: 2,
      pageSize: 10,
    });
    assert.equal(secondPage.page, 2);
    assert.notDeepEqual(secondPage.rows, firstPage.rows, "pagination should return a different slice");

    const historical = await post("/search", {
      query: "index=buttercup_web",
      timeRange: "7d",
      page: 1,
      pageSize: 10,
    });
    assert.ok(historical.totalRows > 0, "the last-seven-days search should include records in its time window");
    assert.ok(historical.totalRows < firstPage.totalRows, "time filtering should return fewer rows than All Time");

    const statistics = await post("/search", {
      query: "index=buttercup_web status>=400 | stats count by status | sort -count",
      timeRange: "all",
      page: 1,
      pageSize: 100,
    });
    assert.equal(statistics.mode, "statistics");
    assert.ok(statistics.totalRows > 0, "status statistics should contain rows");
    assert.ok(statistics.rows.every((row) => row.status >= 400 && Number.isFinite(row.count)));

    const authSearch = await post("/search", {
      query: "index=buttercup_auth action=failure | stats count by user | sort -count",
      timeRange: "all",
      page: 1,
      pageSize: 20,
    });
    assert.equal(authSearch.scanned, 40088);
    assert.ok(authSearch.totalRows > 0);
    const exactCounts = [
      ["buttercup_web", 39532],
      ["buttercup_auth", 40088],
      ["buttercup_sales", 30244],
    ];
    for (const [index, expectedCount] of exactCounts) {
      const countResult = await post("/search", {
        query: `index=${index} | stats count`,
        timeRange: "all",
        page: 1,
        pageSize: 10,
      });
      assert.equal(countResult.rows[0]?.count, expectedCount, `${index} count SPL should match imported records`);
      assert.equal(countResult.scanned, expectedCount, `${index} count SPL should account for every stored event`);
      console.log(`${index} | stats count: ${countResult.rows[0].count.toLocaleString()} events, ${countResult.elapsedMs} ms`);
    }
    console.log(`HTTP API: catalog 4 datasets; events 39,532; stats ${statistics.totalRows} groups; 7d filter ${historical.totalRows} rows; pagination passed; auth groups ${authSearch.totalRows}`);
    console.log(`MongoDB event collection: ${totalStored.toLocaleString()} total active records, no stale or duplicate rows detected.`);
  } finally {
    await new Promise((resolve) => httpServer.close(resolve));
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(`Splunk tutorial verification failed: ${error.message}`);
  process.exitCode = 1;
});
