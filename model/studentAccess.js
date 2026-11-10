"use strict";

const mongoose = require("mongoose");

const studentAccessSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    fullName: { type: String, trim: true, default: "" },
    resourceIds: { type: [String], default: [] },
  },
  { timestamps: true, versionKey: false },
);

module.exports = mongoose.model("StudentAccess", studentAccessSchema);
