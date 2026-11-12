"use strict";
require("dotenv").config();

const mongoose = require("mongoose");
const { performance } = require("node:perf_hooks");
const Dataset = require("../model/SplunkLabDataset");
const Event = require("../model/SplunkLabEvent");
const { assertSafeTutorialDatabaseUrl } = require("../utils/tutorialImportDatabase");
const { executeTutorialSearch, MAX_SCAN } = require("../services/splunkTutorialSearch");
const { runStoredSPL } = require("../services/splunkStudentSearch");

const INDEXES = ["buttercup_web", "buttercup_auth", "buttercup_sales"];

async function main() {
  await mongoose.connect(assertSafeTutorialDatabaseUrl(process.env.DATABASE_URL));
  console.log("Read-only Splunk stored-search profile");
  console.log(`Database: ${mongoose.connection.name} on ${mongoose.connection.host}:${mongoose.connection.port}`);
  console.log(`Event indexes: ${JSON.stringify(await Event.collection.indexes())}`);

  for (const index of INDEXES) {
    const totalStart = performance.now();
    const datasetStart = performance.now();
    const dataset = await Dataset.findOne({ index, status: "ready" }).lean();
    const datasetMs = performance.now() - datasetStart;
    if (!dataset) throw new Error(`No ready dataset metadata for ${index}.`);

    const filter = { index, datasetSlug: dataset.slug, datasetVersion: dataset.version };
    const query = `index=${index} | stats count`;
    const explain = await Event.find(filter).limit(MAX_SCAN + 1).explain("executionStats");
    const fetchStart = performance.now();
    const records = await Event.find(filter).limit(MAX_SCAN + 1).lean();
    const mongoFetchMs = performance.now() - fetchStart;
    const materializeStart = performance.now();
    const events = records.map(({ _id, datasetSlug, datasetVersion, ...event }) => ({
      ...event,
      _time: event._time ? new Date(event._time).toISOString() : null,
    }));
    const materializeMs = performance.now() - materializeStart;
    const splStart = performance.now();
    const result = executeTutorialSearch({ query, index, dataset, events, timeRange: "all" });
    const splExecutionMs = performance.now() - splStart;
    const countExplain = await Event.collection
      .aggregate([{ $match: filter }, { $count: "count" }], { maxTimeMS: 15000 })
      .explain("executionStats");
    const optimizedStart = performance.now();
    const optimizedResult = await runStoredSPL(query, { timeRange: "all" });
    const optimizedTotalMs = performance.now() - optimizedStart;

    console.log(JSON.stringify({
      index,
      expectedCount: dataset.eventCount,
      resultCount: result.rows[0]?.count,
      optimizedResultCount: optimizedResult.rows[0]?.count,
      datasetLookupMs: +datasetMs.toFixed(1),
      mongoFetchMs: +mongoFetchMs.toFixed(1),
      javascriptMaterializeMs: +materializeMs.toFixed(1),
      splExecutionMs: +splExecutionMs.toFixed(1),
      baselineTotalMs: +(performance.now() - totalStart).toFixed(1),
      optimizedCountTotalMs: +optimizedTotalMs.toFixed(1),
      optimizedCountMs: optimizedResult.elapsedMs,
      docsExamined: explain.executionStats.totalDocsExamined,
      keysExamined: explain.executionStats.totalKeysExamined,
      optimizedDocsExamined: countExplain.executionStats.totalDocsExamined,
      optimizedKeysExamined: countExplain.executionStats.totalKeysExamined,
      optimizedMongoMs: countExplain.executionStats.executionTimeMillis,
      baselineWinningPlan: explain.queryPlanner.winningPlan.inputStage?.stage,
      optimizedWinningPlan: countExplain.queryPlanner.winningPlan.queryPlan?.stage || countExplain.queryPlanner.winningPlan.stage,
    }));
  }
}

main()
  .catch((error) => { console.error(`Search profile failed: ${error.message}`); process.exitCode = 1; })
  .finally(async () => { await mongoose.disconnect().catch(() => {}); });
