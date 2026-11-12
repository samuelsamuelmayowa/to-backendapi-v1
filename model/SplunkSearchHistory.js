"use strict";
const mongoose = require("mongoose");
const { Schema } = mongoose;
const schema = new Schema({
  ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  query: { type: String, required: true, maxlength: 3000 },
  index: { type: String, default: "", maxlength: 80 },
  source: { type: String, enum: ["stored", "local"], default: "stored" },
  timeRange: { type: String, enum: ["all", "24h", "7d"], default: "all" },
  status: { type: String, enum: ["complete", "error"], required: true },
  resultCount: { type: Number, default: 0, min: 0 },
  resultRows: { type: Number, default: 0, min: 0 },
  elapsedMs: { type: Number, default: 0, min: 0 },
  error: { type: String, default: "", maxlength: 500 },
}, { timestamps: true, collection: "splunk_student_search_history" });
schema.index({ ownerId: 1, createdAt: -1 });
module.exports = mongoose.model("SplunkSearchHistory", schema);
