// const app = require("./api/index");
// const cors = require("cors");

// // ✅ Use CORS properly
// app.use(cors({
//   origin: ["http://localhost:5173", "https://www.to-analytics.com"], // allowed origins
//   methods: ["GET", "POST", "PATCH", "DELETE"],
//   allowedHeaders: ["Content-Type", "Authorization"],
//   credentials: true,
// }));

// // Optional: You can keep this for safety
// app.use((req, res, next) => {
//   res.setHeader("Content-Type", "application/json");
//   next();
// });

// module.exports = app;


// The active API entry point owns routing and the shared allow-list CORS policy.
module.exports = require("./api/index");
