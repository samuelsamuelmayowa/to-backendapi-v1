"use strict";

const { executeSpl, SplError } = require("./splEngine");

const MAX_QUERY_LENGTH = 3000;
const MAX_PAGE_SIZE = 500;
const MAX_SCAN = 150000;
const TIME_RANGES = new Set(["all", "24h", "7d"]);
const SUPPORTED_COMMANDS = new Set(["search", "where", "stats", "eval", "bin", "timechart", "table", "fields", "sort", "dedup"]);

function queryIndex(query) {
  const firstCommand = String(query).split("|", 1)[0];
  const match = firstCommand.match(/(?:^|\s)index\s*=\s*([A-Za-z0-9_-]+)/i);
  if (!match) throw new SplError("Start the search with an imported index, for example: index=buttercup_web", "search");
  return match[1];
}

function validateCommands(query) {
  const commands = String(query).split("|").slice(1);
  for (const rawCommand of commands) {
    const command = rawCommand.trim();
    if (!command) throw new SplError("A search pipeline cannot contain an empty command.", "search");
    const name = (command.match(/^([A-Za-z_][A-Za-z0-9_]*)/) || [])[1]?.toLowerCase();
    if (!SUPPORTED_COMMANDS.has(name)) {
      throw new SplError(`Command not supported by stored-data search yet: ${name || command.split(/\s+/)[0]}. Try search, where, stats, eval, bin, timechart, table, fields, sort, or dedup.`, name || "search");
    }
  }
}

function resultMode(query) {
  let mode = "events";
  const commands = String(query).split("|").slice(1);
  for (const rawCommand of commands) {
    const command = rawCommand.trim().toLowerCase();
    if (/^timechart\b/.test(command)) mode = "timechart";
    else if (/^(?:stats|top|rare)\b/.test(command)) mode = "statistics";
    else if (/^(?:table|fields)\b/.test(command)) mode = "table";
  }
  return mode;
}

function timeRangeStart(timeRange, now = Date.now()) {
  const value = timeRange || "all";
  if (!TIME_RANGES.has(value)) throw new SplError("Choose a supported time range: all, 24h, or 7d.", "time range");
  if (value === "24h") return now - 24 * 60 * 60 * 1000;
  if (value === "7d") return now - 7 * 24 * 60 * 60 * 1000;
  return null;
}

function executeTutorialSearch({ query, index, dataset, events, timeRange = "all", page = 1, pageSize = 100, now = Date.now() }) {
  const spl = String(query || "").trim();
  if (!spl) throw new SplError("Enter an SPL search before running it.", "search");
  if (spl.length > MAX_QUERY_LENGTH) throw new SplError(`Searches are limited to ${MAX_QUERY_LENGTH} characters.`, "search");
  validateCommands(spl);
  const selectedIndex = queryIndex(spl);
  if (selectedIndex !== index) throw new SplError("The search index does not match the selected dataset.", "search");
  if (!Array.isArray(events) || events.length > MAX_SCAN) throw new SplError("This search exceeds the simulator scan limit. Narrow the index or time range.", "search");

  const start = timeRangeStart(timeRange, now);
  const end = Number(now);
  const inRange = start === null ? events : events.filter((event) => {
    if (!event._time) return false;
    const timestamp = new Date(event._time).getTime();
    return Number.isFinite(timestamp) && timestamp >= start && timestamp <= end;
  });
  const startedAt = performance.now();
  const result = executeSpl(inRange, spl, { index });
  const elapsedMs = Math.max(0, Math.round(performance.now() - startedAt));
  const normalizedPage = Math.max(1, Math.floor(Number(page) || 1));
  const normalizedPageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(Number(pageSize) || 100)));
  const totalRows = result.rows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / normalizedPageSize));
  const currentPage = Math.min(normalizedPage, totalPages);
  const offset = (currentPage - 1) * normalizedPageSize;
  const rows = result.rows.slice(offset, offset + normalizedPageSize).map((row) => ({
    ...row,
    ...(row._time instanceof Date ? { _time: row._time.toISOString() } : {}),
  }));

  return {
    rows,
    count: totalRows,
    totalRows,
    scanned: inRange.length,
    elapsedMs,
    index,
    dataset: { slug: dataset.slug, name: dataset.name },
    mode: resultMode(spl),
    status: "complete",
    warnings: [],
    trace: [],
    page: currentPage,
    pageSize: normalizedPageSize,
    totalPages,
    truncated: totalRows > normalizedPageSize,
  };
}

module.exports = { executeTutorialSearch, queryIndex, resultMode, timeRangeStart, MAX_SCAN, MAX_PAGE_SIZE };
