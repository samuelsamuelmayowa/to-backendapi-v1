"use strict";

const mongoose = require("mongoose");
let pending;
let retryAfter = 0;

function connectDatabase() {
  if (mongoose.connection.readyState === 1) return Promise.resolve();
  if (pending) return pending;
  if (!process.env.DATABASE_URL) return Promise.reject(new Error("DATABASE_URL is not configured."));
  if (Date.now() < retryAfter) return Promise.reject(new Error("Database connection is recovering."));
  pending = mongoose.connect(process.env.DATABASE_URL, {
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 5000,
  }).catch(error => {
    retryAfter = Date.now() + 5000;
    throw error;
  }).finally(() => { pending = null; });
  return pending;
}

async function requireDatabase(req, res, next) {
  let timer;
  try {
    // DNS discovery can outlast the driver's server-selection timeout.
    await Promise.race([
      connectDatabase(),
      new Promise((resolve, reject) => {
        timer = setTimeout(() => reject(new Error("Database connection timed out.")), 6000);
      }),
    ]);
    return next();
  } catch {
    res.set("Retry-After", "5");
    res.set("Cache-Control", "no-store");
    return res.status(503).json({ message: "Sign-in is temporarily unavailable because the account database cannot be reached. Please try again shortly." });
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { connectDatabase, requireDatabase };
