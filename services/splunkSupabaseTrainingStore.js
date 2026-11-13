"use strict";

const DATASETS = "splunk_lab_datasets";
const EVENTS = "splunk_lab_events";
const BATCH_SIZE = 1000;

let client;

function supabase() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Supabase training storage requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  }
  if (!client) client = require("../config/supabaseAdmin");
  return client;
}

function assertNoError(error) {
  if (!error) return;
  const wrapped = new Error(error.code === "PGRST205"
    ? "Supabase Splunk training tables are missing. Apply the Splunk training SQL migration before using or seeding this store."
    : "Supabase training storage request failed.");
  wrapped.status = error.code === "PGRST205" ? 503 : 502;
  wrapped.cause = error;
  throw wrapped;
}

function mapDataset(row) {
  if (!row) return null;
  return {
    slug: row.slug,
    name: row.name,
    description: row.description,
    index: row.index_name,
    sourceCategory: row.source_category,
    sourcetypes: row.sourcetypes || [],
    fields: row.fields || [],
    eventCount: row.event_count,
    timestampRange: { earliest: row.earliest_time, latest: row.latest_time },
    dataOrigin: row.data_origin,
    isSynthetic: row.is_synthetic,
    distributionStatus: row.distribution_status,
    version: row.version,
    status: row.status,
  };
}

async function initialize() {
  const db = supabase();
  const [{ error: datasetError }, { error: eventError }] = await Promise.all([
    db.from(DATASETS).select("slug").limit(1),
    db.from(EVENTS).select("event_id").limit(1),
  ]);
  assertNoError(datasetError);
  assertNoError(eventError);
  return true;
}

async function listCatalog() {
  const { data, error } = await supabase().from(DATASETS)
    .select("slug,name,description,index_name,source_category,sourcetypes,fields,event_count,earliest_time,latest_time,data_origin,is_synthetic,distribution_status,version,status")
    .eq("status", "ready").order("name", { ascending: true });
  assertNoError(error);
  return (data || []).map(mapDataset);
}

async function getReadyDataset(index) {
  const { data, error } = await supabase().from(DATASETS)
    .select("slug,name,description,index_name,source_category,sourcetypes,fields,event_count,earliest_time,latest_time,data_origin,is_synthetic,distribution_status,version,status")
    .eq("index_name", index).eq("status", "ready").maybeSingle();
  assertNoError(error);
  return mapDataset(data);
}

function eventQuery(dataset) {
  return supabase().from(EVENTS).select("event_id,event_data", { count: "exact" })
    .eq("dataset_slug", dataset.slug).eq("dataset_version", dataset.version)
    .eq("index_name", dataset.index);
}

async function countEvents(dataset, start, end) {
  let query = eventQuery(dataset).select("event_id", { count: "exact", head: true });
  if (start !== null) query = query.gte("event_time", new Date(start).toISOString()).lte("event_time", new Date(end).toISOString());
  const { count, error } = await query;
  assertNoError(error);
  return count || 0;
}

async function fetchEvents(dataset, start, end, maxRows) {
  const events = [];
  for (let offset = 0; offset < maxRows; offset += BATCH_SIZE) {
    const endOffset = Math.min(maxRows - 1, offset + BATCH_SIZE - 1);
    let query = eventQuery(dataset).order("event_id", { ascending: true }).range(offset, endOffset);
    if (start !== null) query = query.gte("event_time", new Date(start).toISOString()).lte("event_time", new Date(end).toISOString());
    const { data, error } = await query;
    assertNoError(error);
    for (const row of data || []) events.push({ ...row.event_data, _time: row.event_data?._time || null });
    if (!data || data.length < endOffset - offset + 1) break;
  }
  return events;
}

async function upsertDataset(dataset) {
  const row = {
    slug: dataset.slug,
    name: dataset.name,
    description: dataset.description,
    index_name: dataset.index,
    source_category: dataset.sourceCategory,
    sourcetypes: dataset.sourcetypes,
    fields: dataset.fields,
    event_count: dataset.eventCount,
    earliest_time: dataset.timestampRange.earliest,
    latest_time: dataset.timestampRange.latest,
    data_origin: dataset.dataOrigin,
    is_synthetic: dataset.isSynthetic,
    distribution_status: dataset.distributionStatus,
    version: dataset.version,
    status: dataset.status,
  };
  const { error } = await supabase().from(DATASETS).upsert(row, { onConflict: "slug" });
  assertNoError(error);
}

async function upsertEvents(events) {
  const rows = events.map((event) => ({
    event_id: String(event._id),
    dataset_slug: event.datasetSlug,
    dataset_version: event.datasetVersion,
    index_name: event.index,
    event_time: event._time,
    sourcetype: event.sourcetype,
    event_data: Object.fromEntries(Object.entries(event).filter(([key]) => key !== "_id")),
  }));
  const { error } = await supabase().from(EVENTS).upsert(rows, { onConflict: "event_id", ignoreDuplicates: true });
  assertNoError(error);
}

module.exports = { BATCH_SIZE, countEvents, fetchEvents, getReadyDataset, initialize, listCatalog, upsertDataset, upsertEvents };
