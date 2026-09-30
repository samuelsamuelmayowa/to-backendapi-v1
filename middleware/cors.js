const cors = require("cors");

const allowedOrigins = [
  "http://localhost:5173",
  "https://www.to-analytics.com",
];

module.exports = cors({
  origin(origin, callback) {
    callback(null, Boolean(origin) && allowedOrigins.includes(origin));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
});
