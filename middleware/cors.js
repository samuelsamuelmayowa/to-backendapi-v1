const cors = require("cors");

const allowedOrigins = new Set([
  "http://localhost:5173",
  "https://to-analytics.com",
  "https://www.to-analytics.com",
  ...String(process.env.FRONTEND_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
]);

module.exports = cors({
  origin(origin, callback) {
    callback(null, Boolean(origin) && allowedOrigins.has(origin));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-CSRF-Token", "Cache-Control"],
});
