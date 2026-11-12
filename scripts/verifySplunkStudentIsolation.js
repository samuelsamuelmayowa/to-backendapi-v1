"use strict";
require("dotenv").config();
const assert = require("node:assert/strict");
const express = require("express");
const mongoose = require("mongoose");
const SplunkSavedSearch = require("../model/SplunkSavedSearch");
const SplunkSearchHistory = require("../model/SplunkSearchHistory");
const SplunkStudentDashboard = require("../model/SplunkStudentDashboard");
const SplunkStudentAlert = require("../model/SplunkStudentAlert");
const SplunkMissionProgress = require("../model/SplunkMissionProgress");
const { assertSafeTutorialDatabaseUrl } = require("../utils/tutorialImportDatabase");

async function main() {
  await mongoose.connect(assertSafeTutorialDatabaseUrl(process.env.DATABASE_URL));
  const ownerA = new mongoose.Types.ObjectId();
  const ownerB = new mongoose.Types.ObjectId();
  const app = express();
  app.use(express.json());
  app.use("/api/splunk-lab", require("../routes/splunkLab").createForTests({
    studentAuth: (req, res, next) => {
      req.splunkStudent = { ownerId: req.get("x-test-owner") };
      next();
    },
  }));
  const server = app.listen(0, "127.0.0.1");
  try {
    await new Promise((resolve, reject) => { server.once("listening", resolve); server.once("error", reject); });
    const baseUrl = `http://127.0.0.1:${server.address().port}/api/splunk-lab/student/work`;
    async function request(ownerId, path, method = "GET", data) {
      const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers: { "Content-Type": "application/json", "x-test-owner": String(ownerId) },
        ...(data === undefined ? {} : { body: JSON.stringify(data) }),
      });
      return { status: response.status, body: await response.json() };
    }
    const searchA = await request(ownerA, "/searches", "POST", { name: "A private search", spl: "index=buttercup_web" });
    const searchB = await request(ownerB, "/searches", "POST", { name: "B private search", spl: "index=buttercup_auth" });
    assert.equal(searchA.status, 201); assert.equal(searchB.status, 201);
    const workA = await request(ownerA, ""); const workB = await request(ownerB, "");
    assert.deepEqual(workA.body.data.savedSearches.map((item) => item.id), [searchA.body.data.id]);
    assert.deepEqual(workB.body.data.savedSearches.map((item) => item.id), [searchB.body.data.id]);
    const renamed = await request(ownerA, `/searches/${searchA.body.data.id}`, "PATCH", { name: "A renamed search" });
    assert.equal(renamed.status, 200); assert.equal(renamed.body.data.name, "A renamed search");

    assert.equal((await request(ownerB, `/searches/${searchA.body.data.id}`, "PATCH", { name: "stolen" })).status, 404);
    assert.equal((await request(ownerB, `/searches/${searchA.body.data.id}`, "DELETE")).status, 404);
    const dashboardCreated = await request(ownerA, "/dashboards", "POST", { name: "A dashboard", panels: [{ id: "panel-1", title: "Errors", type: "chart", spl: "index=buttercup_web status>=400 | stats count by status", savedSearchId: searchA.body.data.id }] });
    assert.equal(dashboardCreated.status, 201);
    const dashboardA = dashboardCreated.body.data;
    assert.ok(dashboardA);
    const dashboardRefresh = await request(ownerA, `/dashboards/${dashboardA.id}/refresh`, "POST", { timeRange: "all" });
    assert.equal(dashboardRefresh.status, 200);
    assert.ok(dashboardRefresh.body.data.panels[0].result.totalRows > 0, "dashboard panels should refresh from stored tutorial search results");
    assert.ok(dashboardRefresh.body.data.panels[0].result.scanned > 0, "dashboard refresh should scan actual stored events");
    assert.equal((await request(ownerB, `/dashboards/${dashboardA.id}/refresh`, "POST", { timeRange: "all" })).status, 404);
    assert.equal((await request(ownerB, `/dashboards/${dashboardA.id}`, "DELETE")).status, 404);

    const explorerMission = await request(ownerA, "/missions/buttercup-explorer/submit", "POST", { query: "index=buttercup_web status>=400 | table _time clientip status endpoint", timeRange: "all" });
    assert.equal(explorerMission.status, 200); assert.equal(explorerMission.body.data.passed, true);
    const dashboardMission = await request(ownerA, "/missions/dashboard-builder/submit", "POST", { dashboardId: dashboardA.id });
    assert.equal(dashboardMission.status, 200); assert.equal(dashboardMission.body.data.passed, true);

    const alertA = await request(ownerA, "/alerts", "POST", { name: "A alert", spl: "index=buttercup_auth action=failure", operator: ">=", threshold: 0, metric: "events" });
    assert.equal(alertA.status, 201);
    const alertRun = await request(ownerA, `/alerts/${alertA.body.data.id}/run`, "POST", { timeRange: "all" });
    assert.equal(alertRun.status, 200);
    assert.equal((await request(ownerB, `/alerts/${alertA.body.data.id}/run`, "POST", { timeRange: "all" })).status, 404);
    assert.equal((await request(ownerB, "")).body.data.alerts.length, 0);

    assert.equal((await request(ownerA, "/history", "POST", { query: "index=buttercup_web", source: "local", status: "complete", resultCount: 1, resultRows: 1 })).status, 201);
    assert.equal((await request(ownerB, "/history", "POST", { query: "index=buttercup_auth", source: "local", status: "complete", resultCount: 1, resultRows: 1 })).status, 201);
    assert.equal((await request(ownerA, "/history")).body.data.length, 1);
    assert.equal((await request(ownerB, "/history")).body.data.length, 1);
    assert.equal((await request(ownerA, "/history", "DELETE")).status, 200);
    assert.equal((await request(ownerA, "/history")).body.data.length, 0);
    assert.equal((await request(ownerB, "/history")).body.data.length, 1, "clearing one student's history must preserve another student's history");

    const mission = await request(ownerA, "/missions/event-statistics/submit", "POST", { query: "index=buttercup_auth action=failure | stats count by user | sort -count", timeRange: "all" });
    assert.equal(mission.status, 200);
    assert.equal(mission.body.data.passed, true);
    const progressA = await request(ownerA, "/missions");
    const progressB = await request(ownerB, "/missions");
    for (const missionId of ["buttercup-explorer", "event-statistics", "dashboard-builder"]) {
      assert.equal(progressA.body.data.find((item) => item.id === missionId).progress.completed, true);
      assert.equal(progressB.body.data.find((item) => item.id === missionId).progress, null);
    }
    console.log("Student workspace verified: saved searches rename, dashboard panels refresh from stored data, alerts evaluate actual records, and history/mission progress persist. Cross-owner reads, edits, deletes, refreshes, runs, and history clears were isolated.");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await Promise.all([
      SplunkSavedSearch.deleteMany({ ownerId: { $in: [ownerA, ownerB] } }),
      SplunkSearchHistory.deleteMany({ ownerId: { $in: [ownerA, ownerB] } }),
      SplunkStudentDashboard.deleteMany({ ownerId: { $in: [ownerA, ownerB] } }),
      SplunkStudentAlert.deleteMany({ ownerId: { $in: [ownerA, ownerB] } }),
      SplunkMissionProgress.deleteMany({ ownerId: { $in: [ownerA, ownerB] } }),
    ]);
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(`Splunk student isolation verification failed: ${error.message}`);
  process.exitCode = 1;
});
