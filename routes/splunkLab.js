const express = require("express");
const rateLimit = require("express-rate-limit");
const controller = require("../controller/splunkLab");
const searchController = require("../controller/splunkSearch");
const { runPractice } = require("../services/advancedPractice");
const requireSplunkStudent = require("../middleware/splunkStudentAuth");
const studentRoutes = require("./splunkStudent");

function createSplunkLabRouter({ studentAuth = requireSplunkStudent } = {}) {
const router = express.Router();
const runLimiter = rateLimit({ windowMs: 60 * 1000, max: 40, standardHeaders: true, legacyHeaders: false });
const studentSearchLimiter = rateLimit({ windowMs: 60 * 1000, max: 40, standardHeaders: true, legacyHeaders: false });
const workspaceLimiter = rateLimit({ windowMs: 60 * 1000, max: 120, standardHeaders: true, legacyHeaders: false });

router.get("/catalog", studentAuth, searchController.listCatalog);
router.post("/search", studentAuth, studentSearchLimiter, searchController.search);
router.use("/student", studentAuth, workspaceLimiter, studentRoutes);

// Stateless synthetic practice: no database seed or persistent process required.
router.post("/practice/run", runLimiter, (req, res) => {
  try {
    res.json({ data: runPractice(req.body || {}) });
  } catch (error) {
    res.status(422).json({ message: error.message });
  }
});

router.get("/cases", controller.listCases);
router.get("/cases/:slug", controller.getCase);
router.post("/cases/:slug/start", runLimiter, controller.startAttempt);
router.post("/attempts/:attemptId/run", runLimiter, controller.runSearch);
router.post("/attempts/:attemptId/hint", runLimiter, controller.useHint);
router.post("/attempts/:attemptId/submit", runLimiter, controller.submitAttempt);

return router;
}

const router = createSplunkLabRouter();
router.createForTests = createSplunkLabRouter;
module.exports = router;
