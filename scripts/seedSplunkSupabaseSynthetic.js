"use strict";

require("dotenv").config();
process.env.SPLUNK_TRAINING_STORE = "supabase";

const { DATASETS, FULL_DATASET_COUNTS, VERSION, makeEvent } = require("../services/splunkSyntheticDataset");
const store = require("../services/splunkSupabaseTrainingStore");

async function main() {
  await store.initialize();
  const batchSize = store.BATCH_SIZE;
  let total = 0;
  for (const definition of DATASETS) {
    const count = FULL_DATASET_COUNTS[definition.index];
    const firstTime = makeEvent(definition, 1)._time;
    const lastTime = makeEvent(definition, count)._time;
    const dataset = {
      ...definition,
      eventCount: count,
      timestampRange: { earliest: firstTime, latest: lastTime },
      version: VERSION,
      status: "importing",
    };
    await store.upsertDataset(dataset);
    for (let start = 1; start <= count; start += batchSize) {
      const end = Math.min(count, start + batchSize - 1);
      const events = Array.from({ length: end - start + 1 }, (_, offset) => makeEvent(definition, start + offset));
      await store.upsertEvents(events);
      console.log(`${definition.index}: submitted ${end}/${count}`);
    }
    const actual = await store.countEvents({ slug: definition.slug, version: VERSION, index: definition.index }, null, Date.now());
    if (actual !== count) throw new Error(`${definition.index} expected ${count} events but found ${actual}. Dataset remains hidden as importing.`);
    await store.upsertDataset({ ...dataset, status: "ready" });
    total += actual;
    console.log(`${definition.index}: verified ${actual} synthetic events`);
  }
  console.log(`Supabase training seed complete: ${total} synthetic toa_* events. No Buttercup data or student records were read or changed.`);
}

main().catch((error) => {
  console.error(`Supabase synthetic seed failed: ${error.message || "Unknown error"} Private backend credentials are not printed.`);
  process.exitCode = 1;
});
