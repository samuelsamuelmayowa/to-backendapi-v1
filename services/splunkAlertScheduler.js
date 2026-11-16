"use strict";
const Alert = require("../model/SplunkStudentAlert");
const { runStoredSPL } = require("./splunkStudentSearch");
const { detectDueScenarios } = require("./splunkSocScenario");

const operators = { ">=": (a, b) => a >= b, ">": (a, b) => a > b, "==": (a, b) => a === b, "<=": (a, b) => a <= b, "<": (a, b) => a < b };

async function evaluateAlert(alert, options = {}) {
  const result = await runStoredSPL(alert.spl, { ...options, ownerId: alert.ownerId, pageSize: 1 });
  const matchedEvents = result.matchedEvents ?? result.count;
  const observed = alert.metric === "resultRows" ? result.totalRows : matchedEvents;
  return { ranAt: new Date(), triggered: operators[alert.operator](observed, alert.threshold), observed, metric: alert.metric, resultRows: result.totalRows, matchedEvents };
}

async function runDueAlerts(now = Date.now()) {
  const alerts = await Alert.find({ nextRunAt: { $lte: new Date(now) }, scheduleMinutes: { $gt: 0 } }).sort("nextRunAt").limit(20).lean();
  for (const alert of alerts) {
    const interval = alert.scheduleMinutes * 60_000;
    const firstDue = alert.nextRunAt.getTime();
    const scheduledFor = firstDue + Math.floor((now - firstDue) / interval) * interval;
    let result;
    try {
      result = await evaluateAlert(alert, { now: scheduledFor, timeRange: alert.searchWindow });
    } catch (error) {
      result = { ranAt: new Date(), triggered: false, metric: alert.metric, observed: 0, resultRows: 0, matchedEvents: 0, error: String(error.message).slice(0, 500) };
    }
    await Alert.updateOne({ _id: alert._id, nextRunAt: alert.nextRunAt, updatedAt: alert.updatedAt }, {
      $set: { nextRunAt: new Date(scheduledFor + interval) },
      $push: { history: { $each: [{ ...result, scheduledFor: new Date(scheduledFor) }], $slice: -50 } },
    });
  }
}

function startAlertScheduler() {
  let running = false;
  const timer = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      const results = await Promise.allSettled([detectDueScenarios(), runDueAlerts()]);
      for (const result of results) if (result.status === "rejected") console.error("Splunk scheduler failed:", result.reason.message);
    } finally {
      running = false;
    }
  }, 15_000);
  timer.unref();
  return timer;
}

module.exports = { evaluateAlert, runDueAlerts, startAlertScheduler };
