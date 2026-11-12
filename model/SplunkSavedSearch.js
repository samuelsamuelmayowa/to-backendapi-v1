"use strict";
const mongoose = require("mongoose");
const { Schema } = mongoose;
const schema = new Schema({
  ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  legacyId: { type: String, default: undefined },
  name: { type: String, required: true, trim: true, maxlength: 100 },
  spl: { type: String, required: true, trim: true, maxlength: 3000 },
}, { timestamps: true, collection: "splunk_student_saved_searches" });
schema.index({ ownerId: 1, updatedAt: -1 });
schema.index({ ownerId: 1, legacyId: 1 }, { unique: true, partialFilterExpression: { legacyId: { $type: "string" } } });
module.exports = mongoose.model("SplunkSavedSearch", schema);
