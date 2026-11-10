"use strict";

const crypto = require("crypto");
const jwt = require("jsonwebtoken");

const SESSION_COOKIE = "to_session";
const CSRF_COOKIE = "to_csrf";
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function cookieLifetimeMs() {
  const value = String(process.env.JWT_TIME || "1d").trim();
  const match = /^(\d+(?:\.\d+)?)\s*(s|m|h|d|w)?$/i.exec(value);
  if (!match) return 24 * 60 * 60 * 1000;
  const amount = Number(match[1]);
  const unit = (match[2] || "s").toLowerCase();
  const multipliers = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 };
  return amount * multipliers[unit];
}

function cookieOptions(httpOnly, maxAge = cookieLifetimeMs()) {
  const production = process.env.NODE_ENV === "production" ||
    Boolean(process.env.RENDER_EXTERNAL_URL || process.env.VERCEL_URL);
  const configuredSameSite = String(process.env.SESSION_COOKIE_SAME_SITE || "").toLowerCase();
  const sameSite = configuredSameSite || (production ? "none" : "lax");
  const secure = production || process.env.SESSION_COOKIE_SECURE === "true" || sameSite === "none";
  return {
    httpOnly,
    secure,
    sameSite,
    path: "/",
    maxAge,
  };
}

function issueSessionCookies(res, token) {
  const csrfToken = crypto.randomBytes(32).toString("base64url");
  const expiration = jwt.decode(token)?.exp;
  const maxAge = Number.isFinite(expiration)
    ? Math.max(0, expiration * 1000 - Date.now())
    : cookieLifetimeMs();
  res.set("Cache-Control", "no-store");
  res.cookie(SESSION_COOKIE, token, cookieOptions(true, maxAge));
  res.cookie(CSRF_COOKIE, csrfToken, cookieOptions(true, maxAge));
  return csrfToken;
}

function ensureCsrfCookie(req, res) {
  const existing = req.cookies?.[CSRF_COOKIE];
  if (typeof existing === "string" && existing.length >= 32) return existing;
  const csrfToken = crypto.randomBytes(32).toString("base64url");
  const expiration = jwt.decode(req.cookies?.[SESSION_COOKIE] || "")?.exp;
  const maxAge = Number.isFinite(expiration)
    ? Math.max(0, expiration * 1000 - Date.now())
    : cookieLifetimeMs();
  res.cookie(CSRF_COOKIE, csrfToken, cookieOptions(true, maxAge));
  return csrfToken;
}

function clearSessionCookies(res) {
  const options = cookieOptions(true);
  delete options.maxAge;
  res.clearCookie(SESSION_COOKIE, options);
  res.clearCookie(CSRF_COOKIE, options);
}

function getRequestToken(req) {
  const authorization = String(req.get("Authorization") || "");
  const bearer = /^Bearer\s+([^\s]+)$/i.exec(authorization);
  if (bearer) return { token: bearer[1], source: "bearer" };
  const cookieToken = req.cookies?.[SESSION_COOKIE];
  return typeof cookieToken === "string" && cookieToken
    ? { token: cookieToken, source: "cookie" }
    : { token: "", source: null };
}

function verifyRequestToken(req) {
  if (!process.env.JWT_SECRET) throw new Error("JWT_SECRET is missing from the backend environment.");
  const { token, source } = getRequestToken(req);
  if (!token) return null;
  const claims = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ["HS256"] });
  return { claims, source };
}

function allowedOrigins() {
  const configured = String(process.env.FRONTEND_ORIGINS || "")
    .split(",").map((origin) => origin.trim()).filter(Boolean);
  return new Set([
    "http://localhost:5173",
    "https://to-analytics.com",
    "https://www.to-analytics.com",
    ...configured,
  ]);
}

function requireTrustedOrigin(req, res, next) {
  const origin = req.get("Origin");
  if (!origin || allowedOrigins().has(origin)) return next();
  return res.status(403).json({ message: "Request origin is not allowed." });
}

function csrfProtection(req, res, next) {
  if (SAFE_METHODS.has(req.method) || !req.cookies?.[SESSION_COOKIE]) return next();
  if (["/api/login", "/api/sighup", "/api/google", "/api/admin/login", "/api/session/exchange"].includes(req.path)) return next();

  const cookieToken = String(req.cookies?.[CSRF_COOKIE] || "");
  const headerToken = String(req.get("X-CSRF-Token") || "");
  const cookieBuffer = Buffer.from(cookieToken);
  const headerBuffer = Buffer.from(headerToken);
  const matches = cookieBuffer.length >= 32 &&
    cookieBuffer.length === headerBuffer.length &&
    crypto.timingSafeEqual(cookieBuffer, headerBuffer);

  if (!matches) return res.status(403).json({ message: "CSRF validation failed. Refresh your session and try again." });
  return next();
}

function requireSession(req, res, next) {
  try {
    const verified = verifyRequestToken(req);
    if (!verified) return res.status(401).json({ message: "Please sign in to continue." });
    req.authClaims = verified.claims;
    req.authSource = verified.source;
    return next();
  } catch (error) {
    if (["JsonWebTokenError", "TokenExpiredError", "NotBeforeError"].includes(error?.name)) {
      return res.status(401).json({ message: "Your session is invalid or has expired." });
    }
    return next(error);
  }
}

function requireAdminSession(req, res, next) {
  const email = String(req.authClaims?.email || "").trim().toLowerCase();
  if (req.authClaims?.role !== "admin" || email !== "admin@gmail.com") {
    return res.status(403).json({ message: "Admin access is required." });
  }
  return next();
}

module.exports = {
  SESSION_COOKIE,
  CSRF_COOKIE,
  cookieOptions,
  issueSessionCookies,
  ensureCsrfCookie,
  clearSessionCookies,
  getRequestToken,
  verifyRequestToken,
  requireTrustedOrigin,
  csrfProtection,
  requireSession,
  requireAdminSession,
};
