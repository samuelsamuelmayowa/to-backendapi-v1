"use strict";
const Session = require("../model/SplunkSocSession");
const { executeTutorialSearch } = require("./splunkTutorialSearch");

const MINUTE = 60_000;
const INDEX = "toa_soc";
const dataset = { slug: "toa-soc-v1", index: INDEX, name: "SOC password spray", description: "Your private VPN, identity, endpoint and file audit replay.", isSynthetic: true };
const attacker = "198.51.100.77";
const compromised = "employee-017";
const downloadedFiles = ["/finance/payroll.csv", "/finance/vendor-payments.csv"];
const detectionQuery = "index=toa_soc source=vpn action=failure | dedup src_ip user | stats count as affected_accounts by src_ip | where affected_accounts>=30";

function scenarioEvents(startedAt, now) {
  const start = new Date(startedAt).getTime();
  const events = [];
  function add(offset, event) {
    const timestamp = start + offset;
    if (timestamp <= now) events.push({
      index: INDEX, _time: new Date(timestamp).toISOString(), ...event, _raw: JSON.stringify(event),
    });
  }
  for (let number = 1; number <= 500; number += 1) {
    const user = `employee-${String(number).padStart(3, "0")}`;
    const context = { user, src_ip: `192.0.2.${number % 200 + 1}`, device_id: `laptop-${number}` };
    const offset = (number % 60) * 9000;
    add(offset, { ...context, source: "vpn", action: number % 12 ? "success" : "failure" });
    add(offset, { ...context, source: "identity", action: "mfa", mfa_result: "approved" });
    add(offset, { ...context, source: "endpoint", action: "heartbeat" });
    add(offset, { ...context, source: "files", action: "read", file: "/shared/staff-handbook.pdf" });
    if (number <= 30) add(1000 + number * 200, { source: "vpn", action: "failure", src_ip: attacker, user });
  }
  const suspect = { user: compromised, src_ip: attacker, device_id: "unrecognized-device" };
  add(5 * MINUTE, { ...suspect, source: "vpn", action: "success" });
  add(5 * MINUTE, { ...suspect, source: "identity", action: "mfa", mfa_result: "approved" });
  add(5 * MINUTE + 1000, { ...suspect, source: "endpoint", action: "new_device_session" });
  for (const file of downloadedFiles) {
    add(8 * MINUTE, { ...suspect, source: "files", action: "download", file });
  }
  return events.sort((left, right) => left._time.localeCompare(right._time));
}

function searchScenario(session, query, options = {}) {
  const now = options.now ?? Date.now();
  return executeTutorialSearch({
    query, index: INDEX, dataset, events: scenarioEvents(session.startedAt, now),
    timeRange: options.timeRange, now, page: options.page, pageSize: options.pageSize,
  });
}

async function searchStudentScenario(ownerId, query, options) {
  const session = ownerId && await Session.findOne({ ownerId }).lean();
  if (!session) throw Object.assign(new Error("Start a SOC investigation to search this index."), { status: 404 });
  return searchScenario(session, query, options);
}

async function detectDueScenarios(now = Date.now()) {
  const sessions = await Session.find({ detectionDueAt: { $lte: new Date(now) } }).sort("detectionDueAt").limit(20).lean();
  for (const session of sessions) {
    const result = searchScenario(session, detectionQuery, { now: session.detectionDueAt.getTime(), timeRange: "5m" });
    const match = result.rows[0];
    await Session.updateOne({ _id: session._id, detectionDueAt: session.detectionDueAt }, {
      $unset: { detectionDueAt: 1 },
      ...(match && { $set: { finding: { detectedAt: session.detectionDueAt, sourceIp: match.src_ip, affectedAccounts: match.affected_accounts } } }),
    });
  }
}

async function startScenario(ownerId, now = Date.now()) {
  try {
    return await Session.findOneAndUpdate({ ownerId }, {
      $setOnInsert: { startedAt: new Date(now), detectionDueAt: new Date(now + 5 * MINUTE) },
    }, { upsert: true, new: true }).lean();
  } catch (error) {
    if (error.code !== 11000) throw error;
    return Session.findOne({ ownerId }).lean();
  }
}

async function submitReport(ownerId, report, now = Date.now()) {
  const account = String(report?.account ?? "").trim().toLowerCase();
  const evidence = String(report?.evidence ?? "").trim().slice(0, 3000);
  const sourceIp = String(report?.sourceIp ?? "").trim();
  const mfaResult = String(report?.mfaResult ?? "").trim().toLowerCase();
  const file = String(report?.file ?? "").trim();
  const response = report?.response;
  if (account !== compromised || evidence.length < 20 || !["revoke_sessions", "disable_account"].includes(response)) {
    throw Object.assign(new Error("Identify the compromised account, describe the evidence, and choose a simulated response."), { status: 422 });
  }
  if (sourceIp !== attacker || mfaResult !== "approved" || !downloadedFiles.includes(file)) {
    throw Object.assign(new Error("Check the source IP, MFA result, and downloaded file against the scenario logs."), { status: 422 });
  }
  const updated = await Session.findOneAndUpdate({
    ownerId, "finding.detectedAt": { $exists: true }, startedAt: { $lte: new Date(now - 8 * MINUTE) },
    "report.submittedAt": { $exists: false },
  }, { $set: { report: { account, sourceIp, mfaResult, file, evidence, response, submittedAt: new Date(now) } } }, { new: true }).lean();
  if (!updated) throw Object.assign(new Error("Wait for the file activity and finding before submitting your report. Each case accepts one submission."), { status: 409 });
  return updated;
}

module.exports = { INDEX, dataset, detectionQuery, scenarioEvents, searchScenario, searchStudentScenario, detectDueScenarios, startScenario, submitReport };
