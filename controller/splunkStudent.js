"use strict";

const mongoose = require("mongoose");
const SplunkSavedSearch = require("../model/SplunkSavedSearch");
const SplunkSearchHistory = require("../model/SplunkSearchHistory");
const SplunkStudentDashboard = require("../model/SplunkStudentDashboard");
const SplunkStudentAlert = require("../model/SplunkStudentAlert");
const SplunkMissionProgress = require("../model/SplunkMissionProgress");
const { runStoredSPL } = require("../services/splunkStudentSearch");
const { executeTutorialSearch, queryIndex } = require("../services/splunkTutorialSearch");

const missions = [
  {
    id: "buttercup-explorer",
    level: "Beginner",
    title: "Explore Buttercup web logs",
    scenario: "The store team reports a spike in failed page requests. Inspect the access logs and identify real error events.",
    objectives: ["Select the Buttercup web index", "Filter error responses", "Return event evidence with time and status fields"],
    starterSPL: "index=buttercup_web status>=400 | table _time clientip status endpoint",
    expectedOutcome: "At least one stored access event with HTTP status 400 or higher.",
  },
  {
    id: "event-statistics",
    level: "Intermediate",
    title: "Analyze failed authentication events",
    scenario: "The security team needs a ranked view of users with failed Linux authentication attempts.",
    objectives: ["Search the authentication index", "Focus on failed actions", "Aggregate and rank counts by user"],
    starterSPL: "index=buttercup_auth action=failure | stats count by user | sort -count",
    expectedOutcome: "A user/count table whose values match the stored failed-authentication events.",
  },
  {
    id: "dashboard-builder",
    level: "Advanced",
    title: "Build an error monitoring dashboard",
    scenario: "Create an analyst dashboard panel that helps the store team monitor web errors using imported Buttercup events.",
    objectives: ["Create a chart panel from a saved or custom search", "Use actual imported data", "Save the dashboard and submit it for review"],
    starterSPL: "index=buttercup_web status>=400 | stats count by status | sort -count",
    expectedOutcome: "A saved dashboard with at least one chart panel driven by a stored-data SPL query.",
  },
];

const owner = (req) => req.splunkStudent.ownerId;
const cleanText = (value, max) => String(value ?? "").trim().slice(0, max);
const idFilter = (req) => mongoose.Types.ObjectId.isValid(req.params.id) ? { _id: req.params.id, ownerId: owner(req) } : null;
const toClient = (doc) => {
  if (!doc) return doc;
  const value = doc.toObject ? doc.toObject() : doc;
  return { ...value, id: String(value._id), _id: undefined, ownerId: undefined };
};
const respondError = (res, error) => res.status(error.status || 400).json({ message: error.message || "Invalid Splunk student data." });

exports.getWork = async (req, res, next) => {
  try {
    const [savedSearches, dashboards, alerts, missionProgress] = await Promise.all([
      SplunkSavedSearch.find({ ownerId: owner(req) }).sort({ updatedAt: -1 }).lean(),
      SplunkStudentDashboard.find({ ownerId: owner(req) }).sort({ updatedAt: -1 }).lean(),
      SplunkStudentAlert.find({ ownerId: owner(req) }).sort({ updatedAt: -1 }).lean(),
      SplunkMissionProgress.find({ ownerId: owner(req) }).lean(),
    ]);
    res.json({ data: { savedSearches: savedSearches.map(toClient), dashboards: dashboards.map(toClient), alerts: alerts.map(toClient), missionProgress } });
  } catch (error) { next(error); }
};

exports.migrateLocalWork = async (req, res, next) => {
  const studentOwner = owner(req);
  const legacy = req.body || {};
  const savedMap = new Map();
  const counts = { savedSearches: 0, dashboards: 0, alerts: 0 };
  try {
    for (const item of (Array.isArray(legacy.savedSearches) ? legacy.savedSearches : []).slice(0, 250)) {
      const legacyId = cleanText(item?.id, 100);
      const name = cleanText(item?.name, 100);
      const spl = cleanText(item?.spl, 3000);
      if (!legacyId || !name || !spl) continue;
      const saved = await SplunkSavedSearch.findOneAndUpdate(
        { ownerId: studentOwner, legacyId },
        { $setOnInsert: { ownerId: studentOwner, legacyId, name, spl } },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );
      savedMap.set(legacyId, saved._id);
      counts.savedSearches += 1;
    }
    for (const item of (Array.isArray(legacy.dashboards) ? legacy.dashboards : []).slice(0, 100)) {
      const legacyId = cleanText(item?.id, 100);
      const name = cleanText(item?.name, 100);
      const panels = (Array.isArray(item?.panels) ? item.panels : []).slice(0, 16).map((panel, index) => ({
        id: cleanText(panel?.id, 80) || `panel-${index + 1}`,
        title: cleanText(panel?.title, 80) || "Untitled panel",
        type: ["table", "chart", "number"].includes(panel?.type) ? panel.type : "table",
        spl: cleanText(panel?.spl, 3000),
        savedSearchId: savedMap.get(String(panel?.sourceSearchId || panel?.savedSearchId || "")) || null,
      })).filter((panel) => panel.spl);
      if (!legacyId || !name || !panels.length) continue;
      await SplunkStudentDashboard.updateOne(
        { ownerId: studentOwner, legacyId },
        { $setOnInsert: { ownerId: studentOwner, legacyId, name, panels } },
        { upsert: true, setDefaultsOnInsert: true },
      );
      counts.dashboards += 1;
    }
    for (const item of (Array.isArray(legacy.alerts) ? legacy.alerts : []).slice(0, 100)) {
      const legacyId = cleanText(item?.id, 100);
      const name = cleanText(item?.name, 100);
      const spl = cleanText(item?.spl, 3000);
      const operator = [">=", ">", "==", "<=", "<"].includes(item?.operator) ? item.operator : null;
      const threshold = Number(item?.threshold);
      const metric = ["events", "resultRows"].includes(item?.metric) ? item.metric : "events";
      if (!legacyId || !name || !spl || !operator || !Number.isInteger(threshold) || threshold < 0 || threshold > 1000000) continue;
      await SplunkStudentAlert.updateOne(
        { ownerId: studentOwner, legacyId },
        { $setOnInsert: { ownerId: studentOwner, legacyId, name, spl, operator, threshold, metric, notifyOnTrigger: Boolean(item?.notifyOnTrigger), history: [] } },
        { upsert: true, setDefaultsOnInsert: true },
      );
      counts.alerts += 1;
    }

    const localMissionIds = new Set(missions.map((mission) => mission.id));
    const localProgress = Array.isArray(legacy.missionProgress) ? legacy.missionProgress : [];
    for (const missionId of localProgress.filter((id) => localMissionIds.has(id))) {
      await SplunkMissionProgress.updateOne(
        { ownerId: studentOwner, missionId },
        { $setOnInsert: { ownerId: studentOwner, missionId, completed: true, bestScore: 100, attempts: [] } },
        { upsert: true, setDefaultsOnInsert: true },
      );
    }
    const data = await exports.getWorkData(studentOwner);
    res.json({ data: { ...data, migrated: counts, preservedUnknownProgress: localProgress.filter((id) => !localMissionIds.has(id)).length } });
  } catch (error) { next(error); }
};

exports.getWorkData = async (studentOwner) => {
  const [savedSearches, dashboards, alerts, missionProgress] = await Promise.all([
    SplunkSavedSearch.find({ ownerId: studentOwner }).sort({ updatedAt: -1 }).lean(),
    SplunkStudentDashboard.find({ ownerId: studentOwner }).sort({ updatedAt: -1 }).lean(),
    SplunkStudentAlert.find({ ownerId: studentOwner }).sort({ updatedAt: -1 }).lean(),
    SplunkMissionProgress.find({ ownerId: studentOwner }).lean(),
  ]);
  return { savedSearches: savedSearches.map(toClient), dashboards: dashboards.map(toClient), alerts: alerts.map(toClient), missionProgress };
};

exports.createSavedSearch = async (req, res, next) => {
  try {
    const name = cleanText(req.body?.name, 100), spl = cleanText(req.body?.spl, 3000);
    if (!name || !spl) return res.status(400).json({ message: "Enter a search name and SPL query." });
    const saved = await SplunkSavedSearch.create({ ownerId: owner(req), name, spl });
    res.status(201).json({ data: toClient(saved) });
  } catch (error) { next(error); }
};
exports.updateSavedSearch = async (req, res, next) => {
  try {
    const filter = idFilter(req); if (!filter) return res.status(404).json({ message: "Saved search not found." });
    const changes = {};
    if (Object.hasOwn(req.body || {}, "name")) changes.name = cleanText(req.body.name, 100);
    if (Object.hasOwn(req.body || {}, "spl")) changes.spl = cleanText(req.body.spl, 3000);
    if (!changes.name && Object.hasOwn(changes, "name") || !changes.spl && Object.hasOwn(changes, "spl")) return res.status(400).json({ message: "Search name and SPL cannot be empty." });
    const item = await SplunkSavedSearch.findOneAndUpdate(filter, { $set: changes }, { new: true, runValidators: true });
    if (!item) return res.status(404).json({ message: "Saved search not found." });
    res.json({ data: toClient(item) });
  } catch (error) { next(error); }
};
exports.deleteSavedSearch = async (req, res, next) => {
  try { const filter = idFilter(req); const item = filter && await SplunkSavedSearch.findOneAndDelete(filter); if (!item) return res.status(404).json({ message: "Saved search not found." }); res.json({ data: { id: req.params.id } }); }
  catch (error) { next(error); }
};

async function validatePanels(studentOwner, panels) {
  if (!Array.isArray(panels) || !panels.length || panels.length > 16) throw new Error("A dashboard needs between 1 and 16 panels.");
  const prepared = [];
  for (let index = 0; index < panels.length; index += 1) {
    const panel = panels[index];
    const spl = cleanText(panel?.spl, 3000);
    if (!spl) throw new Error("Each panel must contain an SPL query.");
    let savedSearchId = null;
    if (panel?.savedSearchId && mongoose.Types.ObjectId.isValid(panel.savedSearchId)) {
      const saved = await SplunkSavedSearch.findOne({ _id: panel.savedSearchId, ownerId: studentOwner }).select("_id").lean();
      if (!saved) throw new Error("A panel references a saved search that does not belong to this student.");
      savedSearchId = saved._id;
    }
    prepared.push({
      id: cleanText(panel?.id, 80) || `panel-${index + 1}`,
      title: cleanText(panel?.title, 80) || "Untitled panel",
      type: ["table", "chart", "number"].includes(panel?.type) ? panel.type : "table",
      spl,
      savedSearchId,
    });
  }
  return prepared;
}
exports.createDashboard = async (req, res, next) => {
  try {
    const name = cleanText(req.body?.name, 100);
    if (!name) return res.status(400).json({ message: "Enter a dashboard name." });
    const panels = await validatePanels(owner(req), req.body?.panels);
    const item = await SplunkStudentDashboard.create({ ownerId: owner(req), name, panels });
    res.status(201).json({ data: toClient(item) });
  } catch (error) { if (error.status) respondError(res, error); else next(error); }
};
exports.updateDashboard = async (req, res, next) => {
  try {
    const filter = idFilter(req); if (!filter) return res.status(404).json({ message: "Dashboard not found." });
    const changes = {};
    if (Object.hasOwn(req.body || {}, "name")) changes.name = cleanText(req.body.name, 100);
    if (Object.hasOwn(req.body || {}, "panels")) changes.panels = await validatePanels(owner(req), req.body.panels);
    const item = await SplunkStudentDashboard.findOneAndUpdate(filter, { $set: changes }, { new: true, runValidators: true });
    if (!item) return res.status(404).json({ message: "Dashboard not found." });
    res.json({ data: toClient(item) });
  } catch (error) { if (error.status) respondError(res, error); else next(error); }
};
exports.deleteDashboard = async (req, res, next) => {
  try { const filter = idFilter(req); const item = filter && await SplunkStudentDashboard.findOneAndDelete(filter); if (!item) return res.status(404).json({ message: "Dashboard not found." }); res.json({ data: { id: req.params.id } }); }
  catch (error) { next(error); }
};
exports.refreshDashboard = async (req, res, next) => {
  try {
    const filter = idFilter(req); const dashboard = filter && await SplunkStudentDashboard.findOne(filter).lean();
    if (!dashboard) return res.status(404).json({ message: "Dashboard not found." });
    const panels = await Promise.all(dashboard.panels.map(async (panel) => {
      try { return { ...panel, result: await runStoredSPL(panel.spl, { timeRange: req.body?.timeRange || "all", pageSize: 100 }) }; }
      catch (error) { return { ...panel, error: error.message }; }
    }));
    res.json({ data: { ...toClient(dashboard), panels } });
  } catch (error) { next(error); }
};

exports.createAlert = async (req, res, next) => {
  try {
    const { name, spl, operator, threshold, metric, notifyOnTrigger } = req.body || {};
    const safeName = cleanText(name, 100), safeSpl = cleanText(spl, 3000), value = Number(threshold);
    if (!safeName || !safeSpl || ![">=", ">", "==", "<=", "<"].includes(operator) || !Number.isInteger(value) || value < 0 || value > 1000000 || !["events", "resultRows"].includes(metric || "events")) return res.status(400).json({ message: "Enter a valid name, SPL query, threshold, metric, and comparison." });
    const item = await SplunkStudentAlert.create({ ownerId: owner(req), name: safeName, spl: safeSpl, operator, threshold: value, metric: metric || "events", notifyOnTrigger: Boolean(notifyOnTrigger) });
    res.status(201).json({ data: toClient(item) });
  } catch (error) { next(error); }
};
exports.updateAlert = async (req, res, next) => {
  try {
    const filter = idFilter(req); if (!filter) return res.status(404).json({ message: "Alert not found." });
    const changes = {};
    for (const key of ["name", "spl", "operator", "threshold", "metric", "notifyOnTrigger"]) if (Object.hasOwn(req.body || {}, key)) changes[key] = req.body[key];
    if (changes.name !== undefined) changes.name = cleanText(changes.name, 100);
    if (changes.spl !== undefined) changes.spl = cleanText(changes.spl, 3000);
    const item = await SplunkStudentAlert.findOneAndUpdate(filter, { $set: changes }, { new: true, runValidators: true });
    if (!item) return res.status(404).json({ message: "Alert not found." });
    res.json({ data: toClient(item) });
  } catch (error) { next(error); }
};
exports.deleteAlert = async (req, res, next) => {
  try { const filter = idFilter(req); const item = filter && await SplunkStudentAlert.findOneAndDelete(filter); if (!item) return res.status(404).json({ message: "Alert not found." }); res.json({ data: { id: req.params.id } }); }
  catch (error) { next(error); }
};
const operators = { ">=": (a, b) => a >= b, ">": (a, b) => a > b, "==": (a, b) => a === b, "<=": (a, b) => a <= b, "<": (a, b) => a < b };
exports.runAlert = async (req, res, next) => {
  try {
    const filter = idFilter(req); const alert = filter && await SplunkStudentAlert.findOne(filter);
    if (!alert) return res.status(404).json({ message: "Alert not found." });
    try {
      const result = await runStoredSPL(alert.spl, { timeRange: req.body?.timeRange || "all", pageSize: 1 });
      const observed = alert.metric === "resultRows" ? result.totalRows : result.count;
      const history = { ranAt: new Date(), triggered: operators[alert.operator](observed, alert.threshold), observed, metric: alert.metric, resultRows: result.totalRows, matchedEvents: result.count };
      alert.history.push(history); alert.history = alert.history.slice(-50); await alert.save();
      res.json({ data: { ...history, alertName: alert.name, threshold: alert.threshold, operator: alert.operator, message: history.triggered ? `Triggered: ${observed} ${alert.metric} ${alert.operator} ${alert.threshold}.` : `Not triggered: ${observed} ${alert.metric}; condition is ${alert.operator} ${alert.threshold}.` } });
    } catch (error) {
      if (error.status || error.name === "SplError") {
        const history = { ranAt: new Date(), triggered: false, observed: 0, metric: alert.metric, resultRows: 0, matchedEvents: 0, error: error.message };
        alert.history.push(history); alert.history = alert.history.slice(-50); await alert.save();
        return res.status(error.status || 422).json({ message: error.message });
      }
      throw error;
    }
  } catch (error) { next(error); }
};

exports.listHistory = async (req, res, next) => {
  try { const rows = await SplunkSearchHistory.find({ ownerId: owner(req) }).sort({ createdAt: -1 }).limit(100).lean(); res.json({ data: rows.map(toClient) }); }
  catch (error) { next(error); }
};
exports.createLocalHistory = async (req, res, next) => {
  try {
    const query = cleanText(req.body?.query, 3000);
    const source = req.body?.source === "local" ? "local" : "stored";
    const timeRange = ["all", "24h", "7d"].includes(req.body?.timeRange) ? req.body.timeRange : "all";
    const status = req.body?.status === "error" ? "error" : "complete";
    if (!query) return res.status(400).json({ message: "A search query is required." });
    const resultCount = Math.max(0, Math.min(1000000, Math.floor(Number(req.body?.resultCount) || 0)));
    const resultRows = Math.max(0, Math.min(1000000, Math.floor(Number(req.body?.resultRows) || 0)));
    const elapsedMs = Math.max(0, Math.min(600000, Math.floor(Number(req.body?.elapsedMs) || 0)));
    const item = await SplunkSearchHistory.create({
      ownerId: owner(req), query, source, timeRange,
      index: cleanText(req.body?.index, 80) || (query.match(/(?:^|\s)index=([A-Za-z0-9_-]+)/i) || [])[1] || "",
      status, resultCount, resultRows, elapsedMs,
      error: status === "error" ? cleanText(req.body?.error, 500) : "",
    });
    res.status(201).json({ data: toClient(item) });
  } catch (error) { next(error); }
};
exports.clearHistory = async (req, res, next) => {
  try { const result = await SplunkSearchHistory.deleteMany({ ownerId: owner(req) }); res.json({ data: { deletedCount: result.deletedCount } }); }
  catch (error) { next(error); }
};

function sameRows(left, right) {
  const key = (row) => `${String(row.user)}\u0000${Number(row.count)}`;
  return left.length === right.length && left.map(key).sort().every((value, index) => value === right.map(key).sort()[index]);
}
exports.listMissions = async (req, res, next) => {
  try {
    const progress = await SplunkMissionProgress.find({ ownerId: owner(req) }).lean();
    const byMission = new Map(progress.map((item) => [item.missionId, item]));
    res.json({ data: missions.map((mission) => ({ ...mission, progress: byMission.get(mission.id) || null })) });
  } catch (error) { next(error); }
};
exports.submitMission = async (req, res, next) => {
  try {
    const mission = missions.find((item) => item.id === req.params.missionId);
    if (!mission) return res.status(404).json({ message: "Mission not found." });
    let passed = false, feedback = "Search ran, but its results do not yet meet the mission requirements.", result = null;
    if (mission.id === "dashboard-builder") {
      const filter = req.body?.dashboardId && mongoose.Types.ObjectId.isValid(req.body.dashboardId)
        ? { _id: req.body.dashboardId, ownerId: owner(req) } : null;
      const dashboard = filter && await SplunkStudentDashboard.findOne(filter).lean();
      if (dashboard) {
        for (const panel of dashboard.panels.filter((item) => item.type === "chart")) {
          try {
            const panelResult = await runStoredSPL(panel.spl, { timeRange: "all", pageSize: 100 });
            if (["statistics", "timechart"].includes(panelResult.mode) && panelResult.rows.some((row) => Object.values(row).some((value) => typeof value === "number"))) {
              passed = true; result = { dashboardId: String(dashboard._id), dashboardName: dashboard.name, panelTitle: panel.title, rows: panelResult.totalRows }; break;
            }
          } catch { /* A panel with an unsupported or unavailable search is not valid evidence. */ }
        }
      }
      feedback = passed ? `Dashboard “${result.dashboardName}” contains a chart panel backed by stored SPL results.` : "Save a dashboard with a chart panel whose stored-data SPL query returns statistics or timechart results.";
    } else {
      const query = cleanText(req.body?.query, 3000);
      try { result = await runStoredSPL(query, { timeRange: req.body?.timeRange || "all", pageSize: 500 }); }
      catch (error) { return res.status(error.status || 422).json({ message: error.message, command: error.command }); }
      if (mission.id === "buttercup-explorer") {
        const index = queryIndex(query);
        passed = index === "buttercup_web" && result.rows.length > 0 && result.rows.every((row) => Number(row.status) >= 400) && result.rows.some((row) => row._raw || row.endpoint);
        feedback = passed ? `Found ${result.totalRows.toLocaleString()} real web-error events. Review their timestamps and endpoints to summarize the incident.` : "Use the Buttercup web index and return event evidence for HTTP errors (status 400 or higher), including a time or endpoint field.";
      } else {
        const index = queryIndex(query);
        if (index === "buttercup_auth") {
          const expected = await runStoredSPL("index=buttercup_auth action=failure | stats count by user", { timeRange: "all", pageSize: 500 });
          const fieldsPresent = result.rows.length > 0 && result.rows.every((row) => Object.hasOwn(row, "user") && Number.isFinite(Number(row.count)));
          passed = fieldsPresent && sameRows(result.rows, expected.rows);
        }
        feedback = passed ? `Your user/count results match ${result.count.toLocaleString()} stored failed-authentication events.` : "Return an aggregate table with one user and a numeric count for each failed-authentication user. The score checks the actual result rows against stored records.";
      }
    }
    const score = passed ? 100 : result ? 35 : 0;
    const updateOperation = {
      $setOnInsert: { ownerId: owner(req), missionId: mission.id },
      $max: { bestScore: score },
      $push: { attempts: { $each: [{ score, passed, feedback }], $slice: -50 } },
    };
    if (passed) updateOperation.$set = { completed: true };
    const update = await SplunkMissionProgress.findOneAndUpdate(
      { ownerId: owner(req), missionId: mission.id }, updateOperation,
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
    );
    res.json({ data: { missionId: mission.id, passed, score, feedback, progress: { completed: update.completed, bestScore: update.bestScore }, result: result && mission.id !== "dashboard-builder" ? { rows: result.rows, totalRows: result.totalRows, scanned: result.scanned, mode: result.mode } : undefined } });
  } catch (error) { next(error); }
};

