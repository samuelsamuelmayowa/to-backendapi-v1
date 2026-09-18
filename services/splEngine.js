class SplError extends Error {
  constructor(message, command) {
    super(message);
    this.name = "SplError";
    this.command = command;
  }
}

const splitOutsideQuotes = (input, separator) => {
  const parts = [];
  let current = "";
  let quote = null;
  for (const char of input) {
    if ((char === '"' || char === "'") && (!quote || quote === char)) quote = quote ? null : char;
    if (char === separator && !quote) {
      parts.push(current.trim());
      current = "";
    } else current += char;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
};

const valueFor = (row, field) => {
  const key = Object.keys(row).find((item) => item.toLowerCase() === field.toLowerCase());
  return key ? row[key] : undefined;
};

const compare = (left, operator, right) => {
  const clean = String(right).replace(/^['"]|['"]$/g, "");
  const a = Number.isNaN(Number(left)) ? String(left).toLowerCase() : Number(left);
  const b = Number.isNaN(Number(clean)) ? clean.toLowerCase() : Number(clean);
  if (operator === "=") return String(a).includes("*") || String(b).includes("*")
    ? new RegExp(`^${String(b).replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`, "i").test(String(a))
    : a === b;
  if (operator === "!=") return a !== b;
  if (operator === ">") return a > b;
  if (operator === ">=") return a >= b;
  if (operator === "<") return a < b;
  if (operator === "<=") return a <= b;
  return false;
};

function applyConditions(rows, expression) {
  const conditions = expression.match(/[\w.]+\s*(?:!=|>=|<=|=|>|<)\s*(?:"[^"]*"|'[^']*'|[^\s]+)/g) || [];
  if (!conditions.length) return rows;
  return rows.filter((row) => conditions.every((condition) => {
    const match = condition.match(/^([\w.]+)\s*(>=|<=|!=|=|>|<)\s*(.+)$/);
    return match && compare(valueFor(row, match[1]), match[2], match[3]);
  }));
}

function stats(rows, source) {
  const match = source.match(/^stats\s+(.+?)(?:\s+by\s+(.+))?$/i);
  if (!match) throw new SplError("Use: stats <function> [AS name] [BY field]", "stats");
  const aggregations = splitOutsideQuotes(match[1], ",").map((part) => {
    const agg = part.trim().match(/^(count|sum|avg|min|max)(?:\(([^)]+)\))?(?:\s+as\s+(\w+))?$/i);
    if (!agg) throw new SplError(`Unsupported stats expression: ${part}`, "stats");
    return { fn: agg[1].toLowerCase(), field: agg[2]?.trim(), alias: agg[3] || (agg[1].toLowerCase() === "count" ? "count" : `${agg[1].toLowerCase()}(${agg[2]})`) };
  });
  const groupFields = match[2] ? match[2].split(/\s*,\s*|\s+/).filter(Boolean) : [];
  const groups = new Map();
  for (const row of rows) {
    const key = groupFields.map((field) => String(valueFor(row, field))).join("\u0001");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return [...groups.values()].map((group) => {
    const result = {};
    groupFields.forEach((field) => { result[field] = valueFor(group[0], field); });
    aggregations.forEach(({ fn, field, alias }) => {
      const values = field ? group.map((row) => Number(valueFor(row, field))).filter(Number.isFinite) : [];
      if (fn === "count") result[alias] = group.length;
      if (fn === "sum") result[alias] = values.reduce((sum, value) => sum + value, 0);
      if (fn === "avg") result[alias] = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
      if (fn === "min") result[alias] = values.length ? Math.min(...values) : null;
      if (fn === "max") result[alias] = values.length ? Math.max(...values) : null;
    });
    return result;
  });
}

function executeSpl(events, query, metadata = {}) {
  if (!query?.trim()) throw new SplError("Enter an SPL search before running it.", "search");
  const commands = splitOutsideQuotes(query.trim(), "|");
  let rows = events.map((event) => ({ ...event }));
  const base = commands.shift();
  const indexMatch = base.match(/\bindex\s*=\s*([^\s]+)/i);
  const sourceMatch = base.match(/\bsourcetype\s*=\s*([^\s]+)/i);
  if (indexMatch && metadata.index && indexMatch[1] !== metadata.index) rows = [];
  if (sourceMatch && metadata.sourcetype && sourceMatch[1] !== metadata.sourcetype) rows = [];
  rows = applyConditions(rows, base.replace(/\b(?:index|sourcetype)\s*=\s*[^\s]+/gi, ""));

  for (const raw of commands) {
    const command = raw.trim();
    if (/^search\s+/i.test(command)) rows = applyConditions(rows, command.replace(/^search\s+/i, ""));
    else if (/^where\s+/i.test(command)) rows = applyConditions(rows, command.replace(/^where\s+/i, ""));
    else if (/^stats\s+/i.test(command)) rows = stats(rows, command);
    else if (/^(table|fields)\s+/i.test(command)) {
      const fields = command.replace(/^(table|fields)\s+/i, "").split(/\s*,\s*|\s+/).filter(Boolean);
      rows = rows.map((row) => Object.fromEntries(fields.map((field) => [field, valueFor(row, field)])));
    } else if (/^sort\s+/i.test(command)) {
      const spec = command.replace(/^sort\s+/i, "").trim().split(/\s+/);
      const descending = spec[0] === "-" || spec[0]?.startsWith("-");
      const field = spec[0] === "-" || spec[0] === "+" ? spec[1] : spec[0].replace(/^[-+]/, "");
      rows.sort((a, b) => String(valueFor(a, field)).localeCompare(String(valueFor(b, field)), undefined, { numeric: true }) * (descending ? -1 : 1));
    } else if (/^dedup\s+/i.test(command)) {
      const fields = command.replace(/^dedup\s+/i, "").split(/\s+/);
      const seen = new Set();
      rows = rows.filter((row) => { const key = fields.map((field) => valueFor(row, field)).join("\u0001"); if (seen.has(key)) return false; seen.add(key); return true; });
    } else throw new SplError(`Command not supported yet: ${command.split(/\s+/)[0]}`, command.split(/\s+/)[0]);
  }
  return { rows, count: rows.length, scanned: events.length };
}

module.exports = { executeSpl, SplError };
