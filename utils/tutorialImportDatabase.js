"use strict";

const ALLOWED_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const REQUIRED_DATABASE = "to_analytics_lab";

function assertSafeTutorialDatabaseUrl(value) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("Set DATABASE_URL to a local MongoDB development database before importing tutorial data.");
  }

  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("DATABASE_URL must be a valid local MongoDB URI for the tutorial import.");
  }

  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (
    url.protocol !== "mongodb:" ||
    !ALLOWED_HOSTS.has(url.hostname.toLowerCase()) ||
    (url.port && url.port !== "27017") ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    database !== REQUIRED_DATABASE
  ) {
    throw new Error(
      `Tutorial import is restricted to the isolated local MongoDB database ${REQUIRED_DATABASE} on port 27017. Remote, credentialed, and other database destinations are rejected.`,
    );
  }

  return url.toString();
}

module.exports = { assertSafeTutorialDatabaseUrl };
