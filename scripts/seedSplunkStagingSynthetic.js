"use strict";

require("dotenv").config();
const mongoose = require("mongoose");
const Dataset = require("../model/SplunkLabDataset");
const Event = require("../model/SplunkLabEvent");
const { seedSyntheticTrainingData } = require("../services/splunkSyntheticDataset");
const { assertSafeStagingDatabaseUrl } = require("../utils/stagingSplunkDatabase");

async function main() {
  const target = assertSafeStagingDatabaseUrl(process.env.TOA_SPLUNK_STAGING_DATABASE_URL, process.env.TOA_SPLUNK_STAGING_CONFIRM, process.env.TOA_SPLUNK_STAGING_ALLOWED_HOST);
  console.log(`Seeding original synthetic training data into isolated MongoDB staging database ${target.database} on ${target.hostname}.`);
  await mongoose.connect(process.env.TOA_SPLUNK_STAGING_DATABASE_URL, { serverSelectionTimeoutMS: 10000 });
  await Promise.all([Dataset.createIndexes(), Event.createIndexes()]);
  const seeded = await seedSyntheticTrainingData({ Dataset, Event });
  for (const entry of seeded) console.log(`${entry.index}: ${entry.eventCount} records`);
  console.log(`Seed complete: ${seeded.reduce((sum, entry) => sum + entry.eventCount, 0)} original synthetic records. Existing student-work collections are not read or modified.`);
}

main().catch((error) => { console.error(`Synthetic staging seed failed (${error.name || "Error"}). Review the private staging job logs without sharing connection strings or credentials.`); process.exitCode = 1; })
  .finally(async () => { if (mongoose.connection.readyState) await mongoose.disconnect(); });
