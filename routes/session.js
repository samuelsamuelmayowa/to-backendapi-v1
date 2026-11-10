"use strict";

const express = require("express");
const jwt = require("jsonwebtoken");
const User = require("../model/user");
const firebaseAdmin = require("../firebase");
const { checkCourseAccess, checkQuizAccess, getMyAccess } = require("../services/studentAccess");
const {
  verifyRequestToken,
  issueSessionCookies,
  ensureCsrfCookie,
  clearSessionCookies,
  requireTrustedOrigin,
  requireSession,
} = require("../middleware/sessionCookie");

const router = express.Router();
function sessionUser(claims) {
  const email = String(claims?.email || claims?.user?.email || "").trim().toLowerCase();
  const id = String(claims?.userId || claims?.id || "").trim();
  if (!email && !id) return null;
  return { id: id || null, email, name: claims?.name || email.split("@")[0], role: claims?.role || "student" };
}

router.get("/session", (req, res) => {
  res.set("Cache-Control", "no-store");
  try {
    const verified = verifyRequestToken(req);
    const user = verified && sessionUser(verified.claims);
    if (!user) {
      return res.status(200).json({ authenticated: false, user: null });
    }
    const csrfToken = ensureCsrfCookie(req, res);
    return res.status(200).json({ authenticated: true, user, csrfToken });
  } catch (error) {
    if (["JsonWebTokenError", "TokenExpiredError", "NotBeforeError"].includes(error?.name)) {
      return res.status(200).json({ authenticated: false, user: null });
    }
    return res.status(500).json({ message: "Unable to read the current session." });
  }
});

router.post("/session/logout", requireTrustedOrigin, (req, res) => {
  res.set("Cache-Control", "no-store");
  clearSessionCookies(res);
  return res.status(200).json({ authenticated: false });
});

router.post("/session/exchange", requireTrustedOrigin, async (req, res, next) => {
  const authorization = String(req.get("Authorization") || "");
  const match = /^Bearer\s+([^\s]+)$/i.exec(authorization);
  if (!match) return res.status(401).json({ message: "A valid mobile session is required." });

  try {
    let claims;
    try {
      claims = jwt.verify(match[1], process.env.JWT_SECRET, { algorithms: ["HS256"] });
    } catch (jwtError) {
      const firebaseIdentity = await firebaseAdmin.auth().verifyIdToken(match[1], true);
      if (firebaseIdentity.email_verified !== true || !firebaseIdentity.email) throw jwtError;
      claims = { email: firebaseIdentity.email, name: firebaseIdentity.name };
    }

    const email = String(claims.email || "").trim().toLowerCase();
    if (!email) return res.status(401).json({ message: "The mobile session has no account identity." });
    const user = await User.findOne(claims.userId ? { _id: claims.userId } : { email });
    if (!user || String(user.email).trim().toLowerCase() !== email) {
      return res.status(401).json({ message: "The mobile account could not be verified." });
    }

    const sessionToken = jwt.sign(
      { email: user.email, userId: user._id.toString() },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_TIME || "1d" },
    );
    const csrfToken = issueSessionCookies(res, sessionToken);
    return res.status(200).json({
      authenticated: true,
      user: { id: user._id.toString(), name: user.name || email.split("@")[0], email: user.email },
      csrfToken,
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/check-student-access", requireTrustedOrigin, requireSession, async (req, res) => {
  const email = String(req.authClaims?.email || "").trim().toLowerCase();
  const courseId = String(req.body?.courseId || "").trim().toLowerCase();
  if (!email || !email.includes("@")) return res.status(401).json({ allowed: false, error: "Please sign in again." });
  if (!["splunk", "splunk-2026", "stock-options"].includes(courseId)) {
    return res.status(400).json({ allowed: false, error: "Invalid course ID." });
  }
  try {
    const access = await checkCourseAccess(email, courseId);
    return res.status(200).json({ allowed: Boolean(access), ...(access || {}) });
  } catch (error) {
    console.error("Student course access check failed:", error.message);
    return res.status(503).json({ allowed: false, error: "Course access could not be checked." });
  }
});

router.post("/check-quiz-access", requireTrustedOrigin, requireSession, async (req, res) => {
  const email = String(req.authClaims?.email || "").trim().toLowerCase();
  const quizId = String(req.body?.quizId || "").trim().toLowerCase();
  if (!email || !email.includes("@")) return res.status(401).json({ allowed: false, error: "Please sign in again." });
  if (!quizId) return res.status(400).json({ allowed: false, error: "Invalid quiz ID." });
  try {
    const access = await checkQuizAccess(email, quizId);
    return res.status(200).json({ allowed: Boolean(access), ...(access || {}) });
  } catch (error) {
    console.error("Student quiz access check failed:", error.message);
    return res.status(503).json({ allowed: false, error: "Quiz access could not be checked." });
  }
});

router.get("/my-access", requireTrustedOrigin, requireSession, async (req, res) => {
  const email = String(req.authClaims?.email || "").trim().toLowerCase();
  if (!email || !email.includes("@")) return res.status(401).json({ message: "Please sign in again." });
  try {
    res.set("Cache-Control", "no-store");
    return res.status(200).json(await getMyAccess(email));
  } catch (error) {
    console.error("Student access list failed:", error.message);
    return res.status(503).json({ message: "Your course and quiz access could not be loaded." });
  }
});

module.exports = router;
