"use strict";

const VERSION = "toa-training-v1";
const BASE_TIME = Date.UTC(2025, 0, 1, 12, 0, 0);
const FULL_DATASET_COUNTS = Object.freeze({ toa_web: 39532, toa_auth: 40088, toa_sales: 30244, toa_prices: 16 });

const DATASETS = [
  { slug: "toa-web-v1", index: "toa_web", name: "T.O. Web Access Practice", description: "Original synthetic web requests for SPL filtering, status statistics, and time analysis.", sourceCategory: "web_access", sourcetypes: ["toa:access"], fields: ["_time", "clientip", "status", "endpoint", "method", "response_time", "host"], dataOrigin: "Original T.O. Analytics synthetic training records", isSynthetic: true, distributionStatus: "approved_synthetic" },
  { slug: "toa-auth-v1", index: "toa_auth", name: "T.O. Authentication Practice", description: "Original synthetic authentication events for failure analysis and user statistics.", sourceCategory: "authentication", sourcetypes: ["toa:auth"], fields: ["_time", "user", "action", "source_ip", "result", "host"], dataOrigin: "Original T.O. Analytics synthetic training records", isSynthetic: true, distributionStatus: "approved_synthetic" },
  { slug: "toa-sales-v1", index: "toa_sales", name: "T.O. Sales Practice", description: "Original synthetic transactions for vendor and product aggregation practice.", sourceCategory: "sales", sourcetypes: ["toa:sales"], fields: ["_time", "VendorID", "product", "quantity", "revenue", "payment_status", "host"], dataOrigin: "Original T.O. Analytics synthetic training records", isSynthetic: true, distributionStatus: "approved_synthetic" },
  { slug: "toa-prices-v1", index: "toa_prices", name: "T.O. Product Price Practice", description: "Original synthetic product prices for table, filter, and calculated-field exercises.", sourceCategory: "product_prices", sourcetypes: ["toa:prices"], fields: ["_time", "productId", "product_name", "price", "sale_price", "host"], dataOrigin: "Original T.O. Analytics synthetic training records", isSynthetic: true, distributionStatus: "approved_synthetic" },
];

function makeEvent(dataset, number) {
  const time = new Date(BASE_TIME + number * 60_000);
  const common = {
    _id: `${VERSION}-${dataset.index}-${String(number).padStart(4, "0")}`,
    datasetSlug: dataset.slug,
    datasetVersion: VERSION,
    _time: time,
    index: dataset.index,
    source: `synthetic://${dataset.index}/${number}`,
    sourcetype: dataset.sourcetypes[0],
    host: `toa-lab-${(number % 3) + 1}`,
  };
  if (dataset.index === "toa_web") {
    const status = [200, 200, 200, 301, 404, 500][number % 6];
    const endpoint = ["/", "/products", "/cart", "/checkout", "/search"][number % 5];
    const fields = { clientip: `192.0.2.${(number % 200) + 1}`, status, endpoint, method: ["GET", "GET", "POST"][number % 3], response_time: 30 + ((number * 17) % 900) };
    return { ...common, ...fields, _raw: `${time.toISOString()} ${fields.clientip} ${fields.method} ${endpoint} ${status} ${fields.response_time}ms` };
  }
  if (dataset.index === "toa_auth") {
    const fields = { user: `student${(number % 12) + 1}`, action: number % 4 === 0 ? "failure" : "success", source_ip: `198.51.100.${(number % 180) + 1}`, result: number % 4 === 0 ? "denied" : "accepted" };
    return { ...common, ...fields, _raw: `${time.toISOString()} user=${fields.user} action=${fields.action} result=${fields.result}` };
  }
  if (dataset.index === "toa_prices") {
    const products = ["compass", "field-kit", "signal-lamp", "trail-pack", "water-filter", "map-case", "camp-mug", "first-aid-kit", "headlamp", "rain-shell", "trek-poles", "dry-bag", "stove", "cook-set", "sleeping-pad", "day-pack"];
    const fields = { productId: `P${String(number).padStart(4, "0")}`, product_name: products[number - 1], price: Number((18 + number * 7.35).toFixed(2)), sale_price: Number((15 + number * 6.1).toFixed(2)) };
    return { ...common, ...fields, _raw: `${time.toISOString()} productId=${fields.productId} product_name="${fields.product_name}" price=${fields.price} sale_price=${fields.sale_price}` };
  }
  const fields = { VendorID: `V${String((number % 8) + 1).padStart(3, "0")}`, product: ["compass", "field-kit", "signal-lamp", "trail-pack"][number % 4], quantity: (number % 5) + 1, revenue: Number((12.5 + (number % 25) * 4.75).toFixed(2)), payment_status: number % 9 === 0 ? "refunded" : "paid" };
  return { ...common, ...fields, _raw: `${time.toISOString()} vendor=${fields.VendorID} product=${fields.product} revenue=${fields.revenue} payment_status=${fields.payment_status}` };
}

function resolveDatasetCounts(eventsPerDataset) {
  if (eventsPerDataset === undefined) return { ...FULL_DATASET_COUNTS };
  if (!Number.isInteger(eventsPerDataset) || eventsPerDataset < 1 || eventsPerDataset > 5000) {
    throw new Error("eventsPerDataset must be an integer from 1 through 5000 for test fixtures.");
  }
  return Object.fromEntries(DATASETS.map(({ index }) => [index, eventsPerDataset]));
}

function buildSyntheticTrainingData(eventsPerDataset) {
  const counts = resolveDatasetCounts(eventsPerDataset);
  return DATASETS.map((definition) => {
    const count = counts[definition.index];
    const events = Array.from({ length: count }, (_, index) => makeEvent(definition, index + 1));
    const timestamps = events.map((event) => event._time.getTime());
    return {
      dataset: {
        ...definition,
        eventCount: events.length,
        timestampRange: { earliest: new Date(Math.min(...timestamps)), latest: new Date(Math.max(...timestamps)) },
        version: VERSION,
        status: "ready",
      },
      events,
    };
  });
}

async function seedSyntheticTrainingData({ Dataset, Event, eventsPerDataset }) {
  const counts = resolveDatasetCounts(eventsPerDataset);
  const output = [];
  const batchSize = 1000;
  for (const definition of DATASETS) {
    const expectedCount = counts[definition.index];
    const earliest = makeEvent(definition, 1)._time;
    const latest = makeEvent(definition, expectedCount)._time;
    const dataset = {
      ...definition,
      eventCount: expectedCount,
      timestampRange: { earliest, latest },
      version: VERSION,
      status: "importing",
    };
    await Dataset.updateOne({ index: dataset.index }, { $set: dataset }, { upsert: true, runValidators: true });
    for (let offset = 0; offset < expectedCount; offset += batchSize) {
      const stop = Math.min(expectedCount, offset + batchSize);
      const operations = [];
      for (let number = offset + 1; number <= stop; number += 1) {
        const event = makeEvent(definition, number);
        operations.push({ updateOne: { filter: { _id: event._id }, update: { $setOnInsert: event }, upsert: true } });
      }
      await Event.bulkWrite(operations, { ordered: false });
    }
    const actualCount = await Event.countDocuments({ index: dataset.index, datasetSlug: dataset.slug, datasetVersion: VERSION }).exec();
    if (actualCount !== expectedCount) throw new Error(`Synthetic dataset ${dataset.index} count mismatch: expected ${expectedCount}, found ${actualCount}. It remains hidden until repaired.`);
    await Dataset.updateOne({ index: dataset.index, version: VERSION }, { $set: { status: "ready" } }, { runValidators: true });
    output.push({ index: dataset.index, slug: dataset.slug, eventCount: actualCount });
  }
  return output;
}

module.exports = { DATASETS, FULL_DATASET_COUNTS, VERSION, buildSyntheticTrainingData, seedSyntheticTrainingData };
