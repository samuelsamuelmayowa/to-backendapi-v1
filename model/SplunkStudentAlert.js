"use strict";
const mongoose = require("mongoose");
const { Schema } = mongoose;
const runSchema = new Schema({
  ranAt: { type: Date, default: Date.now },
  triggered: { type: Boolean, required: true },
  observed: { type: Number, required: true },
  metric: { type: String, enum: ["events", "resultRows"], required: true },
  resultRows: { type: Number, required: true },
  matchedEvents: { type: Number, required: true },
  error: { type: String, default: "", maxlength: 500 },
}, { _id: false });
const schema = new Schema({
  ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  legacyId: { type: String, default: undefined },
  name: { type: String, required: true, trim: true, maxlength: 100 },
  spl: { type: String, required: true, trim: true, maxlength: 3000 },
  operator: { type: String, enum: [">=", ">", "==", "<=", "<"], required: true },
  threshold: { type: Number, required: true, min: 0, max: 1000000 },
  metric: { type: String, enum: ["events", "resultRows"], default: "events" },
  notifyOnTrigger: { type: Boolean, default: false },
  history: { type: [runSchema], default: [] },
}, { timestamps: true, collection: "splunk_student_alerts" });
schema.index({ ownerId: 1, updatedAt: -1 });
schema.index({ ownerId: 1, legacyId: 1 }, { unique: true, partialFilterExpression: { legacyId: { $type: "string" } } });
module.exports = mongoose.model("SplunkStudentAlert", schema);
