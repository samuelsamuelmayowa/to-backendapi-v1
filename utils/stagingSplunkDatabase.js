"use strict";

const STAGING_DATABASE = "toa_splunk_staging";
const STAGING_CONFIRMATION = "seed-toa-splunk-staging";

function assertSafeStagingDatabaseUrl(connectionString, confirmation, allowedHost) {
  if (typeof connectionString !== "string" || !connectionString.trim()) throw new Error("Set TOA_SPLUNK_STAGING_DATABASE_URL to the isolated staging MongoDB database.");
  let parsed;
  try { parsed = new URL(connectionString); }
  catch { throw new Error("TOA_SPLUNK_STAGING_DATABASE_URL must be a valid MongoDB connection URL."); }
  if (!["mongodb:", "mongodb+srv:"].includes(parsed.protocol)) throw new Error("The staging URL must use MongoDB.");
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, "").split("/")[0] || "");
  if (database !== STAGING_DATABASE) throw new Error(`Staging seeding is restricted to the ${STAGING_DATABASE} database.`);
  const hostname = parsed.hostname.toLowerCase();
  if (!hostname || hostname === "localhost" || hostname === "::1" || hostname === "127.0.0.1" || hostname === "0.0.0.0" || hostname.endsWith(".local")) {
    throw new Error("Staging seeding requires a remote, isolated staging MongoDB host.");
  }
  if (/(^|[.-])(prod|production|live)([.-]|$)/i.test(hostname)) throw new Error("Production-like MongoDB hosts are not allowed for staging seeding.");
  if (typeof allowedHost !== "string" || allowedHost.trim().toLowerCase() !== hostname) throw new Error("Set TOA_SPLUNK_STAGING_ALLOWED_HOST to the exact approved staging MongoDB hostname.");
  if (confirmation !== STAGING_CONFIRMATION) throw new Error(`Set TOA_SPLUNK_STAGING_CONFIRM=${STAGING_CONFIRMATION} to confirm the isolated staging target.`);
  return { hostname, database };
}

module.exports = { STAGING_DATABASE, STAGING_CONFIRMATION, assertSafeStagingDatabaseUrl };
