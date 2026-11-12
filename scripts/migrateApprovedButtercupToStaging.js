"use strict";

require("dotenv").config();
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const Dataset = require("../model/SplunkLabDataset");
const Event = require("../model/SplunkLabEvent");
const { assertSafeTutorialDatabaseUrl } = require("../utils/tutorialImportDatabase");
const { assertSafeStagingDatabaseUrl, STAGING_CONFIRMATION } = require("../utils/stagingSplunkDatabase");

const EXPECTED_COUNTS = Object.freeze({ buttercup_web: 39532, buttercup_auth: 40088, buttercup_sales: 30244, buttercup_prices: 16 });
const AUTHORIZATION_PHRASE = "written-redistribution-authorization-confirmed";
const BATCH_SIZE = 500;

function requireRightsAuthorization(env) {
  if (env.TOA_BUTTERCUP_RIGHTS_CONFIRMATION !== AUTHORIZATION_PHRASE || !String(env.TOA_BUTTERCUP_RIGHTS_REFERENCE || "").trim()) {
    throw new Error("Migration blocked: provide a written redistribution authorization reference and the explicit rights confirmation.");
  }
}

async function main() {
  requireRightsAuthorization(process.env);
  const sourceUri = assertSafeTutorialDatabaseUrl(process.env.DATABASE_URL);
  const target = assertSafeStagingDatabaseUrl(process.env.TOA_SPLUNK_STAGING_DATABASE_URL, process.env.TOA_SPLUNK_STAGING_CONFIRM, process.env.TOA_SPLUNK_STAGING_ALLOWED_HOST);
  console.log(`Approved Buttercup migration: local to_analytics_lab to isolated staging ${target.database} (${target.hostname}).`);

  const sourceConnection = mongoose.createConnection(sourceUri, { serverSelectionTimeoutMS: 10000 });
  const targetConnection = mongoose.createConnection(process.env.TOA_SPLUNK_STAGING_DATABASE_URL, { serverSelectionTimeoutMS: 10000 });
  try {
    await Promise.all([sourceConnection.asPromise(), targetConnection.asPromise()]);
    const SourceDataset = sourceConnection.model(Dataset.modelName, Dataset.schema, "splunk_lab_datasets");
    const SourceEvent = sourceConnection.model(Event.modelName, Event.schema, "splunk_lab_events");
    const TargetDataset = targetConnection.model(Dataset.modelName, Dataset.schema, "splunk_lab_datasets");
    const TargetEvent = targetConnection.model(Event.modelName, Event.schema, "splunk_lab_events");
    await Promise.all([TargetDataset.createIndexes(), TargetEvent.createIndexes()]);

    let total = 0;
    for (const [index, expectedCount] of Object.entries(EXPECTED_COUNTS)) {
      const sourceDataset = await SourceDataset.findOne({ index, status: "ready" }).lean();
      assert.ok(sourceDataset, `Local dataset ${index} must be ready before migration.`);
      assert.equal(sourceDataset.eventCount, expectedCount, `Local catalog count for ${index} must match the verified source count.`);
      const filter = { index, datasetSlug: sourceDataset.slug, datasetVersion: sourceDataset.version };
      const sourceCount = await SourceEvent.countDocuments(filter).exec();
      assert.equal(sourceCount, expectedCount, `Local stored count for ${index} must match the verified source count.`);

      const { _id, createdAt, updatedAt, __v, ...metadata } = sourceDataset;
      await TargetDataset.updateOne({ index }, {
        $set: { ...metadata, status: "importing", distributionStatus: "authorized_for_hosted_training" },
        $setOnInsert: { _id },
      }, { upsert: true, runValidators: true });

      const cursor = SourceEvent.find(filter).sort({ _id: 1 }).lean().cursor({ batchSize: BATCH_SIZE });
      let operations = [];
      for await (const event of cursor) {
        const { _id: eventId, ...eventData } = event;
        operations.push({ updateOne: { filter: { _id: eventId }, update: { $set: eventData }, upsert: true } });
        if (operations.length >= BATCH_SIZE) {
          await TargetEvent.bulkWrite(operations, { ordered: false });
          operations = [];
        }
      }
      if (operations.length) await TargetEvent.bulkWrite(operations, { ordered: false });

      const targetCount = await TargetEvent.countDocuments(filter).exec();
      assert.equal(targetCount, expectedCount, `Hosted stored count for ${index} must match the approved source.`);
      await TargetDataset.updateOne({ index, version: sourceDataset.version }, { $set: { status: "ready" } }, { runValidators: true });
      total += targetCount;
      console.log(`${index}: ${targetCount} verified records`);
    }
    assert.equal(total, 109880);
    console.log("Migration complete. Only the four approved dataset catalog entries and matching events were copied; no student or application collections were accessed.");
  } finally {
    await Promise.all([sourceConnection.close(), targetConnection.close()]);
  }
}

if (require.main === module) {
  main().catch((error) => { console.error(`Approved staging migration stopped (${error.name || "Error"}). No unrelated collections are modified. Review private logs without sharing database credentials.`); process.exitCode = 1; });
}

module.exports = { EXPECTED_COUNTS, requireRightsAuthorization };
