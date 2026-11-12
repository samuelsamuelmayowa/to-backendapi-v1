"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const SplunkLabDataset = require("../model/SplunkLabDataset");
const SplunkLabEvent = require("../model/SplunkLabEvent");
const { runStoredSPL } = require("../services/splunkStudentSearch");

const dataset = { index: "buttercup_web", slug: "buttercup-web", name: "Buttercup Web", version: "test-version", status: "ready" };

function withModelStubs({ count = 7, events = [] } = {}, run) {
  const originalFindOne = SplunkLabDataset.findOne;
  const originalCountDocuments = SplunkLabEvent.countDocuments;
  const originalFind = SplunkLabEvent.find;
  const filters = [];
  let findCalls = 0;
  SplunkLabDataset.findOne = () => ({ lean: async () => dataset });
  SplunkLabEvent.countDocuments = (filter) => {
    filters.push(filter);
    return { maxTimeMS() { return this; }, exec: async () => count };
  };
  SplunkLabEvent.find = () => {
    findCalls += 1;
    return { limit() { return this; }, maxTimeMS() { return this; }, lean: async () => events };
  };
  return Promise.resolve(run({ filters, get findCalls() { return findCalls; } }))
    .finally(() => {
      SplunkLabDataset.findOne = originalFindOne;
      SplunkLabEvent.countDocuments = originalCountDocuments;
      SplunkLabEvent.find = originalFind;
    });
}

test("unfiltered All Time stats count uses Mongo count without loading event documents", async () => {
  await withModelStubs({ count: 39532 }, async (calls) => {
    const result = await runStoredSPL("index=buttercup_web | stats count", { timeRange: "all", page: 1, pageSize: 100 });
    assert.deepEqual(result.rows, [{ count: 39532 }]);
    assert.equal(result.scanned, 39532);
    assert.equal(result.totalRows, 1);
    assert.equal(result.mode, "statistics");
    assert.equal(calls.findCalls, 0);
    assert.equal(calls.filters[0].datasetVersion, "test-version");
  });
});

test("bounded count applies the same inclusive time window without materializing events", async () => {
  const before = Date.now();
  await withModelStubs({ count: 3 }, async (calls) => {
    const result = await runStoredSPL("index=buttercup_web | stats count", { timeRange: "7d" });
    const dateFilter = calls.filters[0]._time;
    assert.ok(dateFilter.$gte instanceof Date);
    assert.ok(dateFilter.$lte instanceof Date);
    assert.ok(Math.abs((dateFilter.$lte.getTime() - dateFilter.$gte.getTime()) - 7 * 24 * 60 * 60 * 1000) < 1000);
    assert.ok(dateFilter.$lte.getTime() >= before);
    assert.equal(result.rows[0].count, 3);
    assert.equal(result.scanned, 3);
    assert.equal(calls.findCalls, 0);
  });
});

test("other SPL pipelines still execute through the full event path", async () => {
  const eventTime = new Date(Date.now() - 1000);
  await withModelStubs({ events: [{ index: dataset.index, status: 200, _time: eventTime }] }, async (calls) => {
    const result = await runStoredSPL("index=buttercup_web | stats count by status", { timeRange: "all" });
    assert.equal(result.rows[0].count, 1);
    assert.equal(result.rows[0].status, 200);
    assert.equal(calls.filters.length, 0);
    assert.equal(calls.findCalls, 1);
  });
});

test("invalid time filters remain rejected by the count shortcut", async () => {
  await withModelStubs({}, async ({ filters, findCalls }) => {
    await assert.rejects(runStoredSPL("index=buttercup_web | stats count", { timeRange: "30d" }), /supported time range/);
    assert.equal(filters.length, 0);
    assert.equal(findCalls, 0);
  });
});
