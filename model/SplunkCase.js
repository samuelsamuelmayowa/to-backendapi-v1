const mongoose = require("mongoose");
const { Schema } = mongoose;

const missionSchema = new Schema({
  key: { type: String, required: true },
  title: { type: String, required: true },
  instruction: { type: String, required: true },
  points: { type: Number, required: true, min: 1 },
  expectedQuery: { type: String, required: true, select: false },
  hints: { type: [String], default: [] },
  explanation: String,
}, { _id: false });

const splunkCaseSchema = new Schema({
  slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
  code: { type: String, required: true },
  title: { type: String, required: true },
  subtitle: String,
  briefing: { type: String, required: true },
  difficulty: { type: String, enum: ["Beginner", "Intermediate", "Advanced", "Expert"], default: "Beginner" },
  duration: { type: Number, default: 30 },
  index: { type: String, required: true },
  sourcetype: { type: String, required: true },
  fields: { type: [String], default: [] },
  events: { type: [Schema.Types.Mixed], default: [], select: false },
  missions: { type: [missionSchema], default: [] },
  published: { type: Boolean, default: false, index: true },
}, { timestamps: true });

module.exports = mongoose.model("SplunkCase", splunkCaseSchema);
