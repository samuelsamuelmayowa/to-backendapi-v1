"use strict";
const express = require("express");
const controller = require("../controller/splunkStudent");
const router = express.Router();

router.get("/work", controller.getWork);
router.post("/work/migrate", controller.migrateLocalWork);
router.get("/work/history", controller.listHistory);
router.post("/work/history", controller.createLocalHistory);
router.delete("/work/history", controller.clearHistory);

router.post("/work/searches", controller.createSavedSearch);
router.patch("/work/searches/:id", controller.updateSavedSearch);
router.delete("/work/searches/:id", controller.deleteSavedSearch);

router.post("/work/dashboards", controller.createDashboard);
router.patch("/work/dashboards/:id", controller.updateDashboard);
router.delete("/work/dashboards/:id", controller.deleteDashboard);
router.post("/work/dashboards/:id/refresh", controller.refreshDashboard);

router.post("/work/alerts", controller.createAlert);
router.patch("/work/alerts/:id", controller.updateAlert);
router.delete("/work/alerts/:id", controller.deleteAlert);
router.post("/work/alerts/:id/run", controller.runAlert);

router.get("/work/missions", controller.listMissions);
router.post("/work/missions/:missionId/submit", controller.submitMission);

module.exports = router;
