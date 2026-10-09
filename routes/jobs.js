const express = require("express");
const rateLimit = require("express-rate-limit");
const { createJobsController } = require("../controller/jobsController");

function createJobsRouter(controller = createJobsController()) {
  const router = express.Router();
  const jobsLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Job search request limit reached. Please try again shortly." },
  });

  router.use(jobsLimiter);
  router.get("/", controller.search);
  router.get("/:jobId", controller.detail);
  return router;
}

module.exports = createJobsRouter();
module.exports.createJobsRouter = createJobsRouter;
