"use strict";

const mongoose = require("mongoose");
const { Schema } = mongoose;

const splunkLabDatasetSchema = new Schema({
  slug: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true },
  description: { type: String, required: true },
  index: { type: String, required: true, unique: true, index: true },
  sourceCategory: { type: String, required: true },
  sourcetypes: { type: [String], default: [] },
  fields: { type: [String], default: [] },
  eventCount: { type: Number, required: true, min: 0 },
  timestampRange: {
    earliest: { type: Date, default: null },
    latest: { type: Date, default: null },
  },
  dataOrigin: { type: String, required: true },
  isSynthetic: { type: Boolean, default: true },
  distributionStatus: { type: String, default: "review_required" },
  version: { type: String, required: true },
  status: { type: String, enum: ["ready", "importing"], default: "ready", index: true },
}, { timestamps: true, collection: "splunk_lab_datasets" });

module.exports = mongoose.model("SplunkLabDataset", splunkLabDatasetSchema);
