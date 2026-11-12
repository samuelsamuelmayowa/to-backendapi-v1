"use strict";
const mongoose = require("mongoose");
const { Schema } = mongoose;
const panelSchema = new Schema({
  id: { type: String, required: true, maxlength: 80 },
  title: { type: String, required: true, trim: true, maxlength: 80 },
  type: { type: String, enum: ["table", "chart", "number"], required: true },
  spl: { type: String, required: true, trim: true, maxlength: 3000 },
  savedSearchId: { type: Schema.Types.ObjectId, ref: "SplunkSavedSearch", default: null },
}, { _id: false });
const schema = new Schema({
  ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  legacyId: { type: String, default: undefined },
  name: { type: String, required: true, trim: true, maxlength: 100 },
  panels: { type: [panelSchema], default: [], validate: (items) => items.length > 0 && items.length <= 16 },
}, { timestamps: true, collection: "splunk_student_dashboards" });
schema.index({ ownerId: 1, updatedAt: -1 });
schema.index({ ownerId: 1, legacyId: 1 }, { unique: true, partialFilterExpression: { legacyId: { $type: "string" } } });
module.exports = mongoose.model("SplunkStudentDashboard", schema);
