"use strict";

const { performance } = require("node:perf_hooks");
const SplunkLabDataset = require("../model/SplunkLabDataset");
const SplunkLabEvent = require("../model/SplunkLabEvent");
const { executeTutorialSearch, queryIndex, timeRangeStart, MAX_SCAN, MAX_PAGE_SIZE } = require("./splunkTutorialSearch");

function isUnfilteredCount(query, index) {
  const match = String(query).trim().match(/^index\s*=\s*([A-Za-z0-9_-]+)\s*\|\s*stats\s+count\s*$/i);
  return Boolean(match && match[1] === index);
}

function resultPageSize(value) {
  return Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(Number(value) || 100)));
}

async function runStoredSPL(query, options = {}) {
  const index = queryIndex(query);
  const dataset = await SplunkLabDataset.findOne({ index, status: "ready" }).lean();
  if (!dataset) {
    const error = new Error(`Index ${index} is not available. Import the local tutorial archives first.`);
    error.status = 404;
    throw error;
  }
  const timeRange = options.timeRange || "all";
  if (isUnfilteredCount(query, index)) {
    const now = Date.now();
    const start = timeRangeStart(timeRange, now);
    const filter = { index, datasetSlug: dataset.slug, datasetVersion: dataset.version };
    if (start !== null) filter._time = { $gte: new Date(start), $lte: new Date(now) };
    const countStarted = performance.now();
    const count = await SplunkLabEvent.countDocuments(filter).maxTimeMS(15000).exec();
    const elapsedMs = Math.max(0, Math.round(performance.now() - countStarted));
    if (count > MAX_SCAN) {
      const error = new Error("This index exceeds the simulator scan limit. Narrow the search and try again.");
      error.status = 422;
      throw error;
    }
    return {
      rows: [{ count }],
      count: 1,
      totalRows: 1,
      scanned: count,
      elapsedMs,
      index,
      dataset: { slug: dataset.slug, name: dataset.name },
      mode: "statistics",
      status: "complete",
      warnings: [],
      trace: [],
      page: 1,
      pageSize: resultPageSize(options.pageSize),
      totalPages: 1,
      truncated: false,
    };
  }
  const records = await SplunkLabEvent.find({
    index,
    datasetSlug: dataset.slug,
    datasetVersion: dataset.version,
  }).limit(MAX_SCAN + 1).lean();
  if (records.length > MAX_SCAN) {
    const error = new Error("This index exceeds the simulator scan limit. Narrow the search and try again.");
    error.status = 422;
    throw error;
  }
  const events = records.map(({ _id, datasetSlug, datasetVersion, ...event }) => ({
    ...event,
    _time: event._time ? new Date(event._time).toISOString() : null,
  }));
  return executeTutorialSearch({
    query,
    index,
    dataset,
    events,
    timeRange,
    page: options.page,
    pageSize: Math.min(MAX_PAGE_SIZE, Number(options.pageSize) || 100),
  });
}

module.exports = { runStoredSPL };
