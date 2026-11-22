"use strict";
const mongoose = require("mongoose");
const { Schema } = mongoose;
const positionSchema = new Schema({
  x: { type: Number, required: true, min: 0, max: 960, validate: Number.isInteger },
  y: { type: Number, required: true, min: 0, max: 5240, validate: Number.isInteger },
  width: { type: Number, required: true, min: 240, max: 1200, validate: Number.isInteger },
  height: { type: Number, required: true, min: 160, max: 5400, validate: Number.isInteger },
}, { _id: false });
const panelSchema = new Schema({
  id: { type: String, required: true, maxlength: 80 },
  title: { type: String, required: true, trim: true, maxlength: 80 },
  type: { type: String, enum: ["table", "chart", "line", "pie", "number"], required: true },
  spl: { type: String, required: true, trim: true, maxlength: 3000 },
  savedSearchId: { type: Schema.Types.ObjectId, ref: "SplunkSavedSearch", default: null },
  position: { type: positionSchema, default: undefined },
}, { _id: false });
const schema = new Schema({
  ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  legacyId: { type: String, default: undefined },
  name: { type: String, required: true, trim: true, maxlength: 100 },
  layout: { type: String, enum: ["grid", "absolute"], default: "grid" },
  panels: { type: [panelSchema], default: [], validate: (items) => items.length > 0 && items.length <= 16 },
}, { timestamps: true, collection: "splunk_student_dashboards" });
schema.index({ ownerId: 1, updatedAt: -1 });
schema.index({ ownerId: 1, legacyId: 1 }, { unique: true, partialFilterExpression: { legacyId: { $type: "string" } } });
module.exports = mongoose.model("SplunkStudentDashboard", schema);
