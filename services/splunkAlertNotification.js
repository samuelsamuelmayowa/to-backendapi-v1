"use strict";
const escapeHtml = (value) => String(value ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const ops = {
  ">=": (a, b) => a >= b,
  ">": (a, b) => a > b,
  "==": (a, b) => a === b,
  "<=": (a, b) => a <= b,
  "<": (a, b) => a < b,
};

function validateSimulatedNotification(data) {
  if (!data || typeof data !== "object") throw new Error("Invalid notification.");
  const { alertName, spl, operator, metric, triggered, observed, threshold } = data;
  if (typeof alertName !== "string" || !alertName.trim() || alertName.length > 100) throw new Error("Invalid alert name.");
  if (typeof spl !== "string" || !spl.trim() || spl.length > 4000) throw new Error("Invalid SPL query.");
  if (!Object.hasOwn(ops, operator)) throw new Error("Invalid alert operator.");
  if (!Number.isInteger(observed) || observed < 0 || observed > 25000) throw new Error("Invalid observed count.");
  if (!Number.isInteger(threshold) || threshold < 0 || threshold > 1000000) throw new Error("Invalid threshold.");
  if (metric !== "events" && metric !== "resultRows") throw new Error("Invalid alert metric.");
  if (triggered !== true || !ops[operator](observed, threshold)) throw new Error("Only triggered alert simulations can send emails.");
  return { alertName: alertName.trim(), spl: spl.trim(), operator, metric, observed, threshold };
}

function makeEmail(alert) {
  const safe = Object.fromEntries(Object.entries(alert).map(([k, v]) => [k, escapeHtml(v)]));
  const measure = alert.metric === "resultRows" ? "result rows" : "matched events";
  return {
    subject: `Splunk Lab simulation: ${alert.alertName}`,
    text: `T.O. Analytics Splunk Studio Lab — training simulation\n\nAlert: ${alert.alertName}\nCondition: ${measure} ${alert.operator} ${alert.threshold}\nObserved: ${alert.observed}\nSPL: ${alert.spl}\n\nThis is a manually triggered training notification based on synthetic data. It does not monitor live systems.\n`,
    html: `<div style="background:#f1f5f9;padding:24px;font-family:Arial,sans-serif;color:#0f172a"><div style="max-width:580px;margin:auto;background:white;border-radius:15px;overflow:hidden;border:1px solid #e2e8f0"><div style="background:#061326;color:white;padding:23px"><div style="font-size:12px;letter-spacing:2px;color:#67e8f9">T.O. ANALYTICS</div><h1 style="font-size:23px;margin:12px 0 0">Splunk Lab alert triggered</h1></div><div style="padding:24px;line-height:1.6"><strong>${safe.alertName}</strong><p>Condition: ${escapeHtml(measure)} ${safe.operator} ${safe.threshold}</p><p>Observed: <strong>${safe.observed}</strong></p><p style="overflow-wrap:anywhere;background:#f1f5f9;border-radius:8px;padding:12px;font-family:monospace;font-size:12px">${safe.spl}</p><p style="color:#64748b;font-size:12px">Training simulation only. This alert was manually run against synthetic data, not live Splunk events.</p></div></div></div>`,
  };
}
module.exports = { escapeHtml, validateSimulatedNotification, makeEmail };
