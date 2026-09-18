class SplError extends Error {
  constructor(message, command) { super(message); this.name = "SplError"; this.command = command; }
}

const splitTopLevel = (input, separator = ",") => {
  const parts = []; let current = ""; let quote = null; let depth = 0;
  for (const char of String(input)) {
    if ((char === '"' || char === "'") && (!quote || quote === char)) quote = quote ? null : char;
    if (!quote && char === "(") depth += 1;
    if (!quote && char === ")") depth -= 1;
    if (!quote && depth === 0 && char === separator) { if (current.trim()) parts.push(current.trim()); current = ""; }
    else current += char;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
};

const valueFor = (row, field) => {
  const key = Object.keys(row).find((item) => item.toLowerCase() === String(field).toLowerCase());
  return key ? row[key] : undefined;
};
const cleanValue = (value) => String(value ?? "").trim().replace(/^['"]|['"]$/g, "");
const wildcardRegex = (value) => new RegExp(`^${String(value).replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`, "i");

function compare(left, operator, right) {
  const clean = cleanValue(right);
  const numeric = left !== "" && clean !== "" && Number.isFinite(Number(left)) && Number.isFinite(Number(clean));
  const a = numeric ? Number(left) : String(left ?? "").toLowerCase();
  const b = numeric ? Number(clean) : clean.toLowerCase();
  if (operator === "=") return clean.includes("*") ? wildcardRegex(clean).test(String(left ?? "")) : a === b;
  if (operator === "!=") return clean.includes("*") ? !wildcardRegex(clean).test(String(left ?? "")) : a !== b;
  return operator === ">" ? a > b : operator === ">=" ? a >= b : operator === "<" ? a < b : operator === "<=" ? a <= b : false;
}

function filterRows(rows, expression) {
  let source = String(expression || "").replace(/\b(?:AND)\b/gi, " ").trim();
  const conditions = source.match(/[\w.]+\s*(?:!=|>=|<=|=|>|<)\s*(?:"[^"]*"|'[^']*'|[^\s]+)/g) || [];
  source = conditions.reduce((text, condition) => text.replace(condition, " "), source);
  const terms = source.match(/"[^"]+"|'[^']+'|\S+/g)?.map(cleanValue).filter((term) => !/^(or|not)$/i.test(term)) || [];
  return rows.filter((row) => {
    const conditionMatch = conditions.every((condition) => {
      const match = condition.match(/^([\w.]+)\s*(>=|<=|!=|=|>|<)\s*(.+)$/);
      return match && compare(valueFor(row, match[1]), match[2], match[3]);
    });
    const haystack = Object.values(row).join(" ");
    return conditionMatch && terms.every((term) => wildcardRegex(term.includes("*") ? term : `*${term}*`).test(haystack));
  });
}

function parseAggregation(part) {
  const match = part.match(/^(count|sum|avg|min|max)(?:\((.*)\))?(?:\s+as\s+(\w+))?$/i);
  if (!match) throw new SplError(`Unsupported stats expression: ${part}`, "stats");
  return { fn: match[1].toLowerCase(), argument: match[2]?.trim(), alias: match[3] || (match[1].toLowerCase() === "count" ? "count" : `${match[1].toLowerCase()}(${match[2]})`) };
}

function conditionalMatch(row, argument) {
  const evalMatch = String(argument || "").match(/^eval\((.+)\)$/i);
  if (!evalMatch) return true;
  return filterRows([row], evalMatch[1]).length === 1;
}

function stats(rows, source) {
  const body = source.replace(/^stats\s+/i, "");
  const byMatch = body.match(/\s+by\s+(.+)$/i);
  const aggText = byMatch ? body.slice(0, byMatch.index) : body;
  const groupFields = byMatch ? byMatch[1].split(/\s*,\s*|\s+/).filter(Boolean) : [];
  const aggregations = splitTopLevel(aggText).map(parseAggregation);
  const groups = new Map();
  for (const row of rows) {
    const key = groupFields.map((field) => String(valueFor(row, field))).join("\u0001");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  if (!groups.size && !groupFields.length) groups.set("", []);
  return [...groups.values()].map((group) => {
    const result = {};
    groupFields.forEach((field) => { result[field] = valueFor(group[0], field); });
    aggregations.forEach(({ fn, argument, alias }) => {
      const eligible = fn === "count" ? group.filter((row) => conditionalMatch(row, argument)) : group;
      const field = argument?.replace(/^eval\(.+\)$/i, "");
      const values = field ? eligible.map((row) => Number(valueFor(row, field))).filter(Number.isFinite) : [];
      if (fn === "count") result[alias] = eligible.length;
      if (fn === "sum") result[alias] = values.reduce((sum, value) => sum + value, 0);
      if (fn === "avg") result[alias] = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
      if (fn === "min") result[alias] = values.length ? Math.min(...values) : null;
      if (fn === "max") result[alias] = values.length ? Math.max(...values) : null;
    });
    return result;
  });
}

function evaluateExpression(row, expression) {
  let value = expression.trim();
  const round = value.match(/^round\((.+),\s*(\d+)\)$/i);
  if (round) return Number(evaluateExpression(row, round[1]).toFixed(Number(round[2])));
  value = value.replace(/\b[A-Za-z_]\w*\b/g, (field) => {
    const found = valueFor(row, field);
    return found === undefined ? field : Number(found);
  });
  if (!/^[\d+\-*/().\s]+$/.test(value)) return cleanValue(expression);
  return Function(`"use strict"; return (${value})`)();
}

function bucketTime(value, span) {
  const match = String(value).match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return value;
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  const size = span.endsWith("h") ? Number(span.slice(0, -1)) * 60 : Number(span.replace("m", ""));
  const bucket = Math.floor(minutes / size) * size;
  return `${String(Math.floor(bucket / 60)).padStart(2, "0")}:${String(bucket % 60).padStart(2, "0")}`;
}

function timechart(rows, command) {
  const match = command.match(/^timechart\s+span=(\d+[mh])\s+(sum|count)\(([^)]*)\)\s+by\s+(\w+)$/i);
  if (!match) throw new SplError("Use: timechart span=5m sum(field) BY field", "timechart");
  const [, span, fn, valueField, byField] = match;
  const buckets = new Map();
  rows.forEach((row) => {
    const time = bucketTime(valueFor(row, "_time"), span);
    if (!buckets.has(time)) buckets.set(time, { _time: time });
    const output = buckets.get(time); const series = valueFor(row, byField);
    output[series] = (output[series] || 0) + (fn.toLowerCase() === "count" ? 1 : Number(valueFor(row, valueField)) || 0);
  });
  return [...buckets.values()].sort((a, b) => a._time.localeCompare(b._time));
}

function executeSpl(events, query, metadata = {}) {
  if (!query?.trim()) throw new SplError("Enter an SPL search before running it.", "search");
  const commands = splitTopLevel(query.trim(), "|"); let rows = events.map((event) => ({ ...event }));
  const base = commands.shift();
  const indexMatch = base.match(/\bindex\s*=\s*([^\s]+)/i); const sourceMatch = base.match(/\bsourcetype\s*=\s*([^\s]+)/i);
  if (indexMatch && metadata.index && cleanValue(indexMatch[1]).toLowerCase() !== metadata.index.toLowerCase()) rows = [];
  if (sourceMatch && metadata.sourcetype && cleanValue(sourceMatch[1]).toLowerCase() !== metadata.sourcetype.toLowerCase()) rows = [];
  rows = filterRows(rows, base.replace(/\b(?:index|sourcetype)\s*=\s*[^\s]+/gi, ""));

  for (const raw of commands) {
    const command = raw.trim();
    if (/^search\s+/i.test(command)) rows = filterRows(rows, command.replace(/^search\s+/i, ""));
    else if (/^where\s+/i.test(command)) rows = filterRows(rows, command.replace(/^where\s+/i, ""));
    else if (/^stats\s+/i.test(command)) rows = stats(rows, command);
    else if (/^eval\s+/i.test(command)) {
      const match = command.match(/^eval\s+(\w+)\s*=\s*(.+)$/i); if (!match) throw new SplError("Use: eval field=expression", "eval");
      rows = rows.map((row) => ({ ...row, [match[1]]: evaluateExpression(row, match[2]) }));
    } else if (/^rex\s+/i.test(command)) {
      const match = command.match(/^rex\s+field=(\w+)\s+["'](.+)["']$/i); if (!match) throw new SplError('Use: rex field=Field "pattern"', "rex");
      let pattern = match[2].replace(/\(\?<([A-Za-z_]\w*)>/g, "(?<$1>"); const regex = new RegExp(pattern, "i");
      rows = rows.map((row) => ({ ...row, ...(String(valueFor(row, match[1]) || "").match(regex)?.groups || {}) }));
    } else if (/^bin\s+/i.test(command)) {
      const match = command.match(/^bin\s+(\w+)\s+span=(\d+[mh])$/i); if (!match) throw new SplError("Use: bin _time span=1h", "bin");
      rows = rows.map((row) => ({ ...row, [match[1]]: bucketTime(valueFor(row, match[1]), match[2]) }));
    } else if (/^timechart\s+/i.test(command)) rows = timechart(rows, command);
    else if (/^(table|fields)\s+/i.test(command)) { const fields = command.replace(/^(table|fields)\s+/i, "").split(/\s*,\s*|\s+/).filter(Boolean); rows = rows.map((row) => Object.fromEntries(fields.map((field) => [field, valueFor(row, field)]))); }
    else if (/^sort\s+/i.test(command)) { const spec = command.replace(/^sort\s+/i, "").trim().split(/\s+/); const desc = spec[0] === "-" || spec[0].startsWith("-"); const field = spec[0] === "-" || spec[0] === "+" ? spec[1] : spec[0].replace(/^[-+]/, ""); rows.sort((a, b) => String(valueFor(a, field)).localeCompare(String(valueFor(b, field)), undefined, { numeric: true }) * (desc ? -1 : 1)); }
    else if (/^dedup\s+/i.test(command)) { const fields = command.replace(/^dedup\s+/i, "").split(/\s+/); const seen = new Set(); rows = rows.filter((row) => { const key = fields.map((field) => valueFor(row, field)).join("\u0001"); if (seen.has(key)) return false; seen.add(key); return true; }); }
    else throw new SplError(`Command not supported yet: ${command.split(/\s+/)[0]}`, command.split(/\s+/)[0]);
  }
  return { rows, count: rows.length, scanned: events.length };
}

module.exports = { executeSpl, SplError };

// class SplError extends Error {
//   constructor(message, command) {
//     super(message);
//     this.name = "SplError";
//     this.command = command;
//   }
// }

// const splitOutsideQuotes = (input, separator) => {
//   const parts = [];
//   let current = "";
//   let quote = null;
//   for (const char of input) {
//     if ((char === '"' || char === "'") && (!quote || quote === char)) quote = quote ? null : char;
//     if (char === separator && !quote) {
//       parts.push(current.trim());
//       current = "";
//     } else current += char;
//   }
//   if (current.trim()) parts.push(current.trim());
//   return parts;
// };

// const valueFor = (row, field) => {
//   const key = Object.keys(row).find((item) => item.toLowerCase() === field.toLowerCase());
//   return key ? row[key] : undefined;
// };

// const compare = (left, operator, right) => {
//   const clean = String(right).replace(/^['"]|['"]$/g, "");
//   const a = Number.isNaN(Number(left)) ? String(left).toLowerCase() : Number(left);
//   const b = Number.isNaN(Number(clean)) ? clean.toLowerCase() : Number(clean);
//   if (operator === "=") return String(a).includes("*") || String(b).includes("*")
//     ? new RegExp(`^${String(b).replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`, "i").test(String(a))
//     : a === b;
//   if (operator === "!=") return a !== b;
//   if (operator === ">") return a > b;
//   if (operator === ">=") return a >= b;
//   if (operator === "<") return a < b;
//   if (operator === "<=") return a <= b;
//   return false;
// };

// function applyConditions(rows, expression) {
//   const conditions = expression.match(/[\w.]+\s*(?:!=|>=|<=|=|>|<)\s*(?:"[^"]*"|'[^']*'|[^\s]+)/g) || [];
//   if (!conditions.length) return rows;
//   return rows.filter((row) => conditions.every((condition) => {
//     const match = condition.match(/^([\w.]+)\s*(>=|<=|!=|=|>|<)\s*(.+)$/);
//     return match && compare(valueFor(row, match[1]), match[2], match[3]);
//   }));
// }

// function stats(rows, source) {
//   const match = source.match(/^stats\s+(.+?)(?:\s+by\s+(.+))?$/i);
//   if (!match) throw new SplError("Use: stats <function> [AS name] [BY field]", "stats");
//   const aggregations = splitOutsideQuotes(match[1], ",").map((part) => {
//     const agg = part.trim().match(/^(count|sum|avg|min|max)(?:\(([^)]+)\))?(?:\s+as\s+(\w+))?$/i);
//     if (!agg) throw new SplError(`Unsupported stats expression: ${part}`, "stats");
//     return { fn: agg[1].toLowerCase(), field: agg[2]?.trim(), alias: agg[3] || (agg[1].toLowerCase() === "count" ? "count" : `${agg[1].toLowerCase()}(${agg[2]})`) };
//   });
//   const groupFields = match[2] ? match[2].split(/\s*,\s*|\s+/).filter(Boolean) : [];
//   const groups = new Map();
//   for (const row of rows) {
//     const key = groupFields.map((field) => String(valueFor(row, field))).join("\u0001");
//     if (!groups.has(key)) groups.set(key, []);
//     groups.get(key).push(row);
//   }
//   return [...groups.values()].map((group) => {
//     const result = {};
//     groupFields.forEach((field) => { result[field] = valueFor(group[0], field); });
//     aggregations.forEach(({ fn, field, alias }) => {
//       const values = field ? group.map((row) => Number(valueFor(row, field))).filter(Number.isFinite) : [];
//       if (fn === "count") result[alias] = group.length;
//       if (fn === "sum") result[alias] = values.reduce((sum, value) => sum + value, 0);
//       if (fn === "avg") result[alias] = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
//       if (fn === "min") result[alias] = values.length ? Math.min(...values) : null;
//       if (fn === "max") result[alias] = values.length ? Math.max(...values) : null;
//     });
//     return result;
//   });
// }

// function executeSpl(events, query, metadata = {}) {
//   if (!query?.trim()) throw new SplError("Enter an SPL search before running it.", "search");
//   const commands = splitOutsideQuotes(query.trim(), "|");
//   let rows = events.map((event) => ({ ...event }));
//   const base = commands.shift();
//   const indexMatch = base.match(/\bindex\s*=\s*([^\s]+)/i);
//   const sourceMatch = base.match(/\bsourcetype\s*=\s*([^\s]+)/i);
//   if (indexMatch && metadata.index && indexMatch[1] !== metadata.index) rows = [];
//   if (sourceMatch && metadata.sourcetype && sourceMatch[1] !== metadata.sourcetype) rows = [];
//   rows = applyConditions(rows, base.replace(/\b(?:index|sourcetype)\s*=\s*[^\s]+/gi, ""));

//   for (const raw of commands) {
//     const command = raw.trim();
//     if (/^search\s+/i.test(command)) rows = applyConditions(rows, command.replace(/^search\s+/i, ""));
//     else if (/^where\s+/i.test(command)) rows = applyConditions(rows, command.replace(/^where\s+/i, ""));
//     else if (/^stats\s+/i.test(command)) rows = stats(rows, command);
//     else if (/^(table|fields)\s+/i.test(command)) {
//       const fields = command.replace(/^(table|fields)\s+/i, "").split(/\s*,\s*|\s+/).filter(Boolean);
//       rows = rows.map((row) => Object.fromEntries(fields.map((field) => [field, valueFor(row, field)])));
//     } else if (/^sort\s+/i.test(command)) {
//       const spec = command.replace(/^sort\s+/i, "").trim().split(/\s+/);
//       const descending = spec[0] === "-" || spec[0]?.startsWith("-");
//       const field = spec[0] === "-" || spec[0] === "+" ? spec[1] : spec[0].replace(/^[-+]/, "");
//       rows.sort((a, b) => String(valueFor(a, field)).localeCompare(String(valueFor(b, field)), undefined, { numeric: true }) * (descending ? -1 : 1));
//     } else if (/^dedup\s+/i.test(command)) {
//       const fields = command.replace(/^dedup\s+/i, "").split(/\s+/);
//       const seen = new Set();
//       rows = rows.filter((row) => { const key = fields.map((field) => valueFor(row, field)).join("\u0001"); if (seen.has(key)) return false; seen.add(key); return true; });
//     } else throw new SplError(`Command not supported yet: ${command.split(/\s+/)[0]}`, command.split(/\s+/)[0]);
//   }
//   return { rows, count: rows.length, scanned: events.length };
// }

// module.exports = { executeSpl, SplError };
