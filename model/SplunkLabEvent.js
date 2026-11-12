"use strict";

const mongoose = require("mongoose");
const { Schema } = mongoose;

const splunkLabEventSchema = new Schema({
  datasetSlug: { type: String, required: true },
  datasetVersion: { type: String, required: true },
  _time: { type: Date, default: null },
  _raw: { type: String, required: true },
  index: { type: String, required: true },
  source: { type: String, required: true },
  sourcetype: { type: String, required: true },
  host: { type: String, required: true },
}, { strict: false, versionKey: false, collection: "splunk_lab_events" });

splunkLabEventSchema.index({ index: 1, datasetSlug: 1, datasetVersion: 1, sourcetype: 1 });
splunkLabEventSchema.index({ index: 1, datasetSlug: 1, datasetVersion: 1, _time: 1 });

module.exports = mongoose.model("SplunkLabEvent", splunkLabEventSchema);
