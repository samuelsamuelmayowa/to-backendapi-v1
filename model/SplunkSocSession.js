"use strict";
const mongoose = require("mongoose");
const { Schema } = mongoose;

const schema = new Schema({
  ownerId: { type: Schema.Types.ObjectId, required: true, unique: true },
  startedAt: { type: Date, required: true },
  detectionDueAt: { type: Date, index: true },
  finding: {
    detectedAt: Date,
    sourceIp: String,
    affectedAccounts: Number,
  },
  report: {
    account: String,
    sourceIp: String,
    mfaResult: String,
    file: String,
    evidence: String,
    response: String,
    submittedAt: Date,
  },
}, { collection: "splunk_soc_sessions" });

module.exports = mongoose.model("SplunkSocSession", schema);
