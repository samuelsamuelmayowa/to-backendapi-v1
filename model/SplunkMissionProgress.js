"use strict";
const mongoose = require("mongoose");
const { Schema } = mongoose;
const attemptSchema = new Schema({
  submittedAt: { type: Date, default: Date.now },
  score: { type: Number, min: 0, max: 100, required: true },
  passed: { type: Boolean, required: true },
  feedback: { type: String, maxlength: 500, required: true },
}, { _id: false });
const schema = new Schema({
  ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  missionId: { type: String, required: true, enum: ["buttercup-explorer", "event-statistics", "dashboard-builder"] },
  bestScore: { type: Number, default: 0, min: 0, max: 100 },
  completed: { type: Boolean, default: false },
  attempts: { type: [attemptSchema], default: [] },
}, { timestamps: true, collection: "splunk_student_mission_progress" });
schema.index({ ownerId: 1, missionId: 1 }, { unique: true });
module.exports = mongoose.model("SplunkMissionProgress", schema);
