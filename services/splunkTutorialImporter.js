"use strict";

const { createHash } = require("node:crypto");
const { readZipEntries } = require("../utils/safeZip");

const MONTHS = Object.fromEntries("Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ").map((month, i) => [month, i]));
const DATASETS = {
  buttercup_web: { slug: "buttercup-web", name: "Buttercup Games Web Access Logs", description: "Official Splunk Search Tutorial access.log records from the fictional Buttercup Games store.", category: "web_access", sourcetype: "access_combined" },
  buttercup_auth: { slug: "buttercup-auth", name: "Buttercup Games Linux Authentication", description: "Official Splunk Search Tutorial secure.log records from fictional Linux hosts.", category: "authentication", sourcetype: "linux_secure" },
  buttercup_sales: { slug: "buttercup-sales", name: "Buttercup Games Vendor Sales", description: "Official Splunk Search Tutorial vendor_sales.log records.", category: "application_sales", sourcetype: "vendor_sales" },
  buttercup_prices: { slug: "buttercup-prices", name: "Buttercup Games Price Lookup CSV", description: "The official Splunk Search Tutorial Prices.csv product catalogue.", category: "reference_csv", sourcetype: "csv" },
};
const MAX_EVENTS = 150000;

function parseUtcTimestamp(year, month, day, clock) {
  const monthNumber = MONTHS[month];
  if (monthNumber === undefined) return null;
  const [hour, minute, second] = clock.split(":").map(Number);
  const value = new Date(Date.UTC(Number(year), monthNumber, Number(day), hour, minute, second));
  return Number.isNaN(value.getTime()) ? null : value.toISOString();
}

function findYear(entries) {
  for (const entry of entries) {
    if (!entry.name.endsWith("secure.log")) continue;
    const text = entry.contents.toString("utf8");
    const match = text.match(/\b(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+[A-Z][a-z]{2}\s+\d{1,2}\s+(\d{4})\s+\d{2}:\d{2}:\d{2}/);
    if (match) return Number(match[1]);
  }
  throw new Error("No year could be read from the secure.log records.");
}

function csvRecords(text) {
  const records = [];
  let row = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted && char === '"' && text[index + 1] === '"') { value += '"'; index += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { row.push(value); value = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(value); value = "";
      if (row.some((cell) => cell !== "")) records.push(row);
      row = [];
    } else value += char;
  }
  if (quoted) throw new Error("Prices.csv contains an unterminated quoted field.");
  if (value || row.length) { row.push(value); if (row.some((cell) => cell !== "")) records.push(row); }
  if (records.length < 2) throw new Error("Prices.csv must include a header and at least one row.");
  const [headers, ...data] = records;
  if (headers.some((header) => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(header)) || new Set(headers).size !== headers.length) {
    throw new Error("Prices.csv has invalid or duplicate column names.");
  }
  return data.map((cells, rowNumber) => {
    if (cells.length !== headers.length) throw new Error(`Prices.csv row ${rowNumber + 2} has the wrong number of columns.`);
    return Object.fromEntries(headers.map((header, column) => [header, cells[column]]));
  });
}

function parseAccessLog(line, source, year) {
  const match = line.match(/^(\S+)\s+\S+\s+\S+\s+\[(\d{1,2})\/([A-Z][a-z]{2})\/(\d{4}):(\d{2}:\d{2}:\d{2})\]\s+"([A-Z]+)\s+(.+?)\s+HTTP\s+[^\"]+"\s+(\d{3})\s+(\S+)\s+"([^\"]*)"\s+"([^\"]*)"(?:\s+(\d+))?$/);
  if (!match) return null;
  const [, clientip, day, month, logYear, clock, method, uri, statusText, bytesText, referer, useragent, durationText] = match;
  const _time = parseUtcTimestamp(logYear || year, month, day, clock);
  if (!_time) return null;
  let url;
  try { url = new URL(uri, "http://buttercup.invalid"); } catch { url = null; }
  const fields = {
    clientip,
    method,
    uri,
    status: Number(statusText),
    bytes: bytesText === "-" ? null : Number(bytesText),
    referer,
    useragent,
  };
  if (durationText) fields.duration_ms = Number(durationText);
  if (url) {
    for (const [key, value] of url.searchParams.entries()) {
      if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) && !(key in fields)) fields[key] = value;
    }
    fields.endpoint = url.pathname;
  }
  if (url?.searchParams.has("action")) fields.action = url.searchParams.get("action");
  return { _time, _raw: line, index: "buttercup_web", source, sourcetype: "access_combined", host: source.split("/")[0], ...fields };
}

function parseSecureLog(line, source) {
  const match = line.match(/^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+([A-Z][a-z]{2})\s+(\d{1,2})\s+(\d{4})\s+(\d{2}:\d{2}:\d{2})\s+(\S+)\s+([^:]+):\s*(.*)$/);
  if (!match) return null;
  const [, month, day, year, clock, host, process, message] = match;
  const _time = parseUtcTimestamp(year, month, day, clock);
  if (!_time) return null;
  const fields = { message };
  const processMatch = process.match(/^([A-Za-z0-9_.-]+)(?:\[(\d+)\])?$/);
  if (processMatch) { fields.process = processMatch[1]; if (processMatch[2]) fields.pid = Number(processMatch[2]); }
  const user = message.match(/\bfor\s+(?:invalid user\s+)?([^\s]+)(?=\s+from\b|$)/i) || message.match(/\buser[=: ]+([^\s]+)/i);
  if (user) fields.user = user[1];
  const sourceIp = message.match(/\bfrom\s+((?:\d{1,3}\.){3}\d{1,3})\b/i);
  if (sourceIp) fields.src_ip = sourceIp[1];
  const port = message.match(/\bport\s+(\d+)/i);
  if (port) fields.src_port = Number(port[1]);
  if (/failed password|authentication failure|invalid user/i.test(message)) fields.action = "failure";
  else if (/accepted (?:password|publickey)/i.test(message)) fields.action = "success";
  else if (/session opened/i.test(message)) fields.action = "session_opened";
  else if (/session closed/i.test(message)) fields.action = "session_closed";
  return { _time, _raw: line, index: "buttercup_auth", source, sourcetype: "linux_secure", host, ...fields };
}

function parseSalesLog(line, source) {
  const match = line.match(/^\[(\d{1,2})\/([A-Z][a-z]{2})\/(\d{4}):(\d{2}:\d{2}:\d{2})\]\s+(.*)$/);
  if (!match) return null;
  const [, day, month, year, clock, rawFields] = match;
  const _time = parseUtcTimestamp(year, month, day, clock);
  if (!_time) return null;
  const fields = {};
  for (const field of rawFields.matchAll(/([A-Za-z_][A-Za-z0-9_]*)=([^\s]+)/g)) fields[field[1]] = field[2];
  if (!Object.keys(fields).length) return null;
  return { _time, _raw: line, index: "buttercup_sales", source, sourcetype: "vendor_sales", host: source.split("/")[0], ...fields };
}

function makeDatasetGroups(tutorialZip, pricesZip) {
  const tutorialEntries = readZipEntries(tutorialZip);
  const priceEntries = readZipEntries(pricesZip);
  const year = findYear(tutorialEntries);
  const datasets = new Map(Object.entries(DATASETS).map(([index, definition]) => [index, { definition, events: [], parseErrors: 0 }]));

  for (const entry of tutorialEntries) {
    if (!/^(?:www\d+|mailsv)\/(?:secure\.log|access\.log)$/.test(entry.name) && entry.name !== "vendor_sales/vendor_sales.log") continue;
    const text = entry.contents.toString("utf8");
    const lines = text.split(/\r?\n/);
    for (const line of lines) {
      if (!line.trim()) continue;
      const isAccess = entry.name.endsWith("access.log");
      const isSecure = entry.name.endsWith("secure.log");
      const parsed = isAccess ? parseAccessLog(line, entry.name, year) : isSecure ? parseSecureLog(line, entry.name) : parseSalesLog(line, entry.name);
      const index = isAccess ? "buttercup_web" : isSecure ? "buttercup_auth" : "buttercup_sales";
      const group = datasets.get(index);
      if (!parsed) { group.parseErrors += 1; continue; }
      group.events.push(parsed);
      if (group.events.length > MAX_EVENTS) throw new Error(`The ${index} dataset exceeds the ${MAX_EVENTS}-event import limit.`);
    }
  }

  const pricesEntry = priceEntries.find((entry) => entry.name === "prices.csv");
  if (!pricesEntry) throw new Error("Prices.csv.zip does not contain prices.csv.");
  const priceRows = csvRecords(pricesEntry.contents.toString("utf8").replace(/^\uFEFF/, ""));
  const priceGroup = datasets.get("buttercup_prices");
  priceRows.forEach((row) => {
    const fields = { ...row };
    for (const key of ["price", "sale_price"]) if (fields[key] !== undefined && fields[key] !== "") {
      const number = Number(fields[key]);
      if (!Number.isFinite(number)) throw new Error(`Prices.csv contains an invalid ${key} value.`);
      fields[key] = number;
    }
    const _raw = Object.entries(row).map(([key, value]) => `${key}=${value}`).join(" ");
    priceGroup.events.push({ _time: null, _raw, index: "buttercup_prices", source: "prices.csv", sourcetype: "csv", host: "buttercup_catalog", ...fields });
  });

  const all = [...datasets.values()].reduce((total, group) => total + group.events.length, 0);
  if (!all || all > MAX_EVENTS) throw new Error(`The dataset import must contain 1 to ${MAX_EVENTS} events.`);
  for (const [index, group] of datasets) {
    const inputLines = group.events.length + group.parseErrors;
    if (group.parseErrors / Math.max(inputLines, 1) > 0.01) throw new Error(`More than 1% of ${index} log records could not be parsed.`);
    if (index !== "buttercup_prices" && group.events.length === 0) throw new Error(`No records were parsed for ${index}.`);
    const times = group.events.map((event) => event._time).filter(Boolean).sort();
    group.eventCount = group.events.length;
    group.timestampRange = times.length ? { earliest: times[0], latest: times[times.length - 1] } : null;
    group.fields = [...new Set(group.events.flatMap((event) => Object.keys(event).filter((key) => !["_raw", "index", "source", "sourcetype", "host"].includes(key))))].sort();
    group.sourcetypes = [...new Set(group.events.map((event) => event.sourcetype))];
    delete group.parseErrors;
  }
  return [...datasets.entries()].map(([index, group]) => ({ index, ...group }));
}

function archiveVersion(tutorialZip, pricesZip) {
  return createHash("sha256").update(tutorialZip).update(pricesZip).digest("hex");
}

module.exports = { DATASETS, makeDatasetGroups, archiveVersion, csvRecords, parseAccessLog, parseSecureLog, parseSalesLog };
