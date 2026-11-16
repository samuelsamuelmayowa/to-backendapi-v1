"use strict";
const assert = require("node:assert/strict");
const { test } = require("node:test");
const Alert = require("../model/SplunkStudentAlert");
const Session = require("../model/SplunkSocSession");
const { detectionQuery, detectDueScenarios, scenarioEvents, searchScenario, searchStudentScenario, submitReport } = require("../services/splunkSocScenario");
const { runDueAlerts } = require("../services/splunkAlertScheduler");

const startedAt = new Date("2026-11-16T09:00:00.000Z");
const findingTime = new Date(+startedAt + 300_000);
const ownerId = "507f1f77bcf86cd799439011";
const session = { _id: "session-1", ownerId, startedAt, detectionDueAt: findingTime };

test("replays 500 accounts and releases VPN, MFA, endpoint and file evidence in order", () => {
  const complete = scenarioEvents(startedAt, +startedAt + 600_000);
  assert.equal(new Set(complete.map((event) => event.user)).size, 500);
  assert.deepEqual(searchScenario(session, detectionQuery, { now: +findingTime, timeRange: "5m" }).rows, [
    { src_ip: "198.51.100.77", affected_accounts: 30 },
  ]);
  const evidence = "index=toa_soc src_ip=198.51.100.77 action=download";
  assert.equal(searchScenario(session, evidence, { now: +startedAt + 479_999 }).totalRows, 0);
  assert.equal(searchScenario(session, evidence, { now: +startedAt + 480_000 }).totalRows, 2);
  const identity = searchScenario(session, "index=toa_soc source=identity src_ip=198.51.100.77", { now: +findingTime });
  assert.equal(identity.rows[0].mfa_result, "approved");
});

test("the worker claims the due scenario once and searches require the owning student", async (t) => {
  let due = true;
  let finding;
  t.mock.method(Session, "find", () => ({ sort: () => ({ limit: () => ({ lean: async () => due ? [session] : [] }) }) }));
  t.mock.method(Session, "updateOne", async (filter, update) => {
    assert.equal(filter.detectionDueAt, findingTime);
    if (!due) return;
    due = false;
    finding = update.$set.finding;
  });
  t.mock.method(Session, "findOne", (filter) => ({ lean: async () => filter.ownerId === ownerId ? session : null }));
  await Promise.all([detectDueScenarios(+findingTime), detectDueScenarios(+findingTime)]);
  assert.equal(finding.affectedAccounts, 30);
  assert.equal((await searchStudentScenario(ownerId, detectionQuery, { now: +findingTime })).totalRows, 1);
  await assert.rejects(searchStudentScenario("507f1f77bcf86cd799439012", detectionQuery, { now: +findingTime }), { status: 404 });
});

test("scheduled runs use the saved window and advance the cursor with their history record", async (t) => {
  const alert = {
    _id: "alert-1", ownerId, updatedAt: startedAt, nextRunAt: findingTime, scheduleMinutes: 5,
    searchWindow: "5m", spl: detectionQuery, metric: "resultRows", operator: ">=", threshold: 1,
  };
  t.mock.method(Alert, "find", () => ({ sort: () => ({ limit: () => ({ lean: async () => [alert] }) }) }));
  t.mock.method(Session, "findOne", () => ({ lean: async () => session }));
  const write = t.mock.method(Alert, "updateOne", async (filter, update) => {
    assert.equal(filter.nextRunAt, findingTime);
    assert.equal(filter.updatedAt, startedAt);
    assert.equal(+update.$set.nextRunAt, +findingTime + 300_000);
    assert.equal(update.$push.history.$each[0].triggered, true);
    assert.equal(update.$push.history.$each[0].observed, 1);
    assert.equal(+update.$push.history.$each[0].scheduledFor, +findingTime);
  });
  await runDueAlerts(+findingTime + 10_000);
  assert.equal(write.mock.callCount(), 1);
});

test("a case report grades evidence and records a simulated response for its owner", async (t) => {
  const report = {
    account: "employee-017", sourceIp: "198.51.100.77", mfaResult: "approved",
    file: "/finance/payroll.csv", evidence: "VPN success, followed by payroll download.", response: "revoke_sessions",
  };
  const now = +startedAt + 480_000;
  t.mock.method(Session, "findOneAndUpdate", (filter, update) => ({
    lean: async () => {
      assert.equal(filter.ownerId, ownerId);
      assert.deepEqual(filter["report.submittedAt"], { $exists: false });
      return { ...session, report: update.$set.report };
    },
  }));
  await assert.rejects(submitReport(ownerId, { ...report, file: "/wrong.file" }, now), { status: 422 });
  assert.equal((await submitReport(ownerId, report, now)).report.response, "revoke_sessions");
});
