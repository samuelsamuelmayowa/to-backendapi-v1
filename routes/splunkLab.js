const express = require("express");
const rateLimit = require("express-rate-limit");
const controller = require("../controllers/splunkLab");

const router = express.Router();
const runLimiter = rateLimit({ windowMs: 60 * 1000, max: 40, standardHeaders: true, legacyHeaders: false });

router.get("/cases", controller.listCases);
router.get("/cases/:slug", controller.getCase);
router.post("/cases/:slug/start", runLimiter, controller.startAttempt);
router.post("/attempts/:attemptId/run", runLimiter, controller.runSearch);
router.post("/attempts/:attemptId/hint", runLimiter, controller.useHint);
router.post("/attempts/:attemptId/submit", runLimiter, controller.submitAttempt);

module.exports = router;
