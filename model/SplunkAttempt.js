const mongoose = require("mongoose");
const { Schema } = mongoose;

const splunkAttemptSchema = new Schema({
  caseId: { type: Schema.Types.ObjectId, ref: "SplunkCase", required: true, index: true },
  userId: { type: Schema.Types.ObjectId, ref: "User", default: null, index: true },
  guestId: { type: String, default: null, index: true },
  completedMissions: { type: Map, of: Number, default: {} },
  hintsUsed: { type: Map, of: Number, default: {} },
  queriesRun: { type: Number, default: 0 },
  score: { type: Number, default: 0 },
  status: { type: String, enum: ["started", "completed"], default: "started" },
  completedAt: Date,
}, { timestamps: true });

splunkAttemptSchema.pre("validate", function validateOwner(next) {
  if (!this.userId && !this.guestId) return next(new Error("An attempt requires userId or guestId."));
  next();
});

module.exports = mongoose.model("SplunkAttempt", splunkAttemptSchema);
