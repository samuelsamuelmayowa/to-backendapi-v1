"use strict";

require("dotenv").config();
const fs = require("node:fs");
const path = require("node:path");
const mongoose = require("mongoose");
const SplunkLabDataset = require("../model/SplunkLabDataset");
const SplunkLabEvent = require("../model/SplunkLabEvent");
const { makeDatasetGroups, archiveVersion } = require("../services/splunkTutorialImporter");
const { assertSafeTutorialDatabaseUrl } = require("../utils/tutorialImportDatabase");

const dataDirectory = path.join(__dirname, "..", "data");
const files = {
  tutorial: path.join(dataDirectory, "tutorialdata.zip"),
  prices: path.join(dataDirectory, "Prices.csv.zip"),
};
const CHUNK_SIZE = 1000;

async function importDataset(group, version, imported) {
  const previous = await SplunkLabDataset.findOne({ slug: group.definition.slug }).lean();
  const currentCount = await SplunkLabEvent.countDocuments({
    datasetSlug: group.definition.slug,
    datasetVersion: version,
  });
  if (previous?.version === version && currentCount === group.eventCount) {
    if (previous.status !== "ready") {
      await SplunkLabDataset.updateOne({ slug: group.definition.slug, version }, { $set: { status: "ready" } });
    }
    console.log(`${group.index}: already imported (${group.eventCount.toLocaleString()} records).`);
    return;
  }
  if (previous?.version === version && currentCount !== group.eventCount) {
    await SplunkLabDataset.updateOne({ slug: group.definition.slug }, { $set: { status: "importing" } });
    await SplunkLabEvent.deleteMany({ datasetSlug: group.definition.slug, datasetVersion: version });
  }

  let inserted = 0;
  let committed = false;
  try {
    for (let offset = 0; offset < group.events.length; offset += CHUNK_SIZE) {
      const documents = group.events.slice(offset, offset + CHUNK_SIZE).map((event) => ({
        ...event,
        _time: event._time ? new Date(event._time) : null,
        datasetSlug: group.definition.slug,
        datasetVersion: version,
      }));
      const result = await SplunkLabEvent.collection.insertMany(documents, { ordered: true });
      inserted += result.insertedCount;
    }

    await SplunkLabDataset.findOneAndUpdate({ slug: group.definition.slug }, {
      $set: {
        slug: group.definition.slug,
        name: group.definition.name,
        description: group.definition.description,
        index: group.index,
        sourceCategory: group.definition.category,
        sourcetypes: group.sourcetypes,
        fields: group.fields,
        eventCount: group.eventCount,
        timestampRange: group.timestampRange ? {
          earliest: new Date(group.timestampRange.earliest),
          latest: new Date(group.timestampRange.latest),
        } : { earliest: null, latest: null },
        dataOrigin: "User-supplied Splunk Search Tutorial archive (Buttercup Games)",
        isSynthetic: true,
        distributionStatus: "review_required",
        version,
        status: "ready",
      },
    }, { upsert: true, new: true, runValidators: true });
    committed = true;

    imported.push({ slug: group.definition.slug, version });
    console.log(`${group.index}: imported ${inserted.toLocaleString()} records.`);
  } catch (error) {
    if (!committed) await SplunkLabEvent.deleteMany({ datasetSlug: group.definition.slug, datasetVersion: version }).catch(() => {});
    throw error;
  }

  if (previous?.version && previous.version !== version) {
    await SplunkLabEvent.deleteMany({ datasetSlug: group.definition.slug, datasetVersion: previous.version })
      .catch((error) => console.warn(`${group.index}: old version cleanup deferred (${error.message}).`));
  }
}

async function main() {
  for (const file of Object.values(files)) {
    if (!fs.existsSync(file)) throw new Error(`Required local archive is missing: ${file}`);
  }
  const databaseUrl = assertSafeTutorialDatabaseUrl(process.env.DATABASE_URL);

  const tutorialZip = fs.readFileSync(files.tutorial);
  const pricesZip = fs.readFileSync(files.prices);
  const version = archiveVersion(tutorialZip, pricesZip);
  const groups = makeDatasetGroups(tutorialZip, pricesZip);
  const total = groups.reduce((sum, group) => sum + group.eventCount, 0);
  await mongoose.connect(databaseUrl);

  const imported = [];
  try {
    for (const group of groups) await importDataset(group, version, imported);
    console.log(`Tutorial import ready: ${total.toLocaleString()} records across ${groups.length} indexes.`);
  } catch (error) {
    for (const item of imported) {
      const current = await SplunkLabDataset.findOne({ slug: item.slug }).select("version").lean().catch(() => null);
      if (current?.version !== item.version) await SplunkLabEvent.deleteMany(item).catch(() => {});
    }
    throw error;
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error("Splunk tutorial import failed:", error.message);
  process.exitCode = 1;
});
