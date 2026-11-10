"use strict";
// WORKER: T.O. Analytics orientation feedback route
// Uses the JWT issued by authController.login / authController.googleAuth.
const express = require("express");
const jwt = require("jsonwebtoken");
const { rateLimit } = require("express-rate-limit");
const { createClient } = require("@supabase/supabase-js");
const User = require("../model/user");
const { getRequestToken } = require("../middleware/sessionCookie");

const router = express.Router();
const jwtSecret = process.env.JWT_SECRET;
const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!jwtSecret) throw new Error("JWT_SECRET missing on backend: use the same value as authController.login");
if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing on backend");
}
const db = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const TABLE = "orientation_feedback";
const feedbackLimit = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});

async function requireWebsiteAccount(req, res, next) {
  // IMPORTANT: One backslash in the regex makes \s match a whitespace character.
  const requestToken = getRequestToken(req);
  if (!requestToken.token) return res.status(401).json({ error: "Website login required" });

  try {
    // The existing authController signs using JWT_SECRET with HS256 by default.
    const claims = jwt.verify(requestToken.token, jwtSecret, { algorithms: ["HS256"] });
    const tokenEmail = String(claims?.email || "").trim().toLowerCase();
    const userId = String(claims?.userId || "").trim();
    if (!tokenEmail && !userId) {
      return res.status(401).json({ error: "Login token contains no account identity" });
    }

    // Resolve the identity against your existing MongoDB User model.
    const user = userId
      ? await User.findById(userId).select("email").lean()
      : await User.findOne({ email: tokenEmail }).select("email").lean();
    if (!user?.email) {
      return res.status(401).json({ error: "Account not found; sign in again" });
    }
    const verifiedEmail = String(user.email).trim().toLowerCase();
    if (tokenEmail && verifiedEmail !== tokenEmail) {
      return res.status(401).json({ error: "Login token account mismatch" });
    }
    req.verifiedAccount = { email: verifiedEmail, userId: String(user._id) };
    return next();
  } catch (error) {
    if (["JsonWebTokenError", "TokenExpiredError", "NotBeforeError"].includes(error?.name)) {
      return res.status(401).json({ error: "Invalid or expired login token" });
    }
    console.error("Orientation account lookup failed:", error);
    return res.status(503).json({ error: "Account verification temporarily unavailable" });
  }
}

async function readSummary() {
  const { data, error } = await db.from(TABLE).select("rating");
  if (error) throw error;
  const count = (data || []).length;
  const sum = (data || []).reduce((total, row) => total + Number(row.rating), 0);
  return { count, average: count ? Math.round((sum / count) * 10) / 10 : null };
}

router.get("/", async (_req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    res.json({ summary: await readSummary() });
  } catch (error) {
    console.error("Feedback summary failed:", error);
    res.status(503).json({ error: "Feedback temporarily unavailable" });
  }
});

router.get("/me", requireWebsiteAccount, async (req, res) => {
  try {
    const { data, error } = await db.from(TABLE)
      .select("rating, comment")
      .eq("email", req.verifiedAccount.email)
      .maybeSingle();
    if (error) throw error;
    res.set("Cache-Control", "no-store");
    res.json({ review: data || null });
  } catch (error) {
    console.error("Read feedback failed:", error);
    res.status(503).json({ error: "Feedback temporarily unavailable" });
  }
});

router.post("/", requireWebsiteAccount, feedbackLimit, async (req, res) => {
  const rating = req.body?.rating;
  const comment = req.body?.comment ?? "";
  if (!Number.isInteger(rating) || rating < 1 || rating > 5 ||
      typeof comment !== "string" || comment.length > 1000) {
    return res.status(400).json({ error: "Rating must be 1–5; comment must be at most 1,000 characters" });
  }
  try {
    const { error } = await db.from(TABLE).upsert({
      email: req.verifiedAccount.email, // NEVER trust an email submitted by the browser
      rating,
      comment: comment.trim(),
      updated_at: new Date().toISOString(),
    }, { onConflict: "email" });
    if (error) throw error;
    res.set("Cache-Control", "no-store");
    return res.json({ saved: true, summary: await readSummary() });
  } catch (error) {
    console.error("Save feedback failed:", error);
    return res.status(503).json({ error: "Feedback could not be saved" });
  }
});

module.exports = router;

// "use strict";
// /**
//  * Example Express backend for the rating UI.
//  * Adjust paths to match YOUR backend directory structure, and register with:
//  * app.use('/api/orientation-feedback', require('./routes/orientationFeedback'));
//  *
//  * This example uses the SAME Google/Firebase verification middleware shown in
//  * your Splunk alert route. Confirm the website supplies a compatible ID token.
//  * The server MUST NOT accept a client-submitted email to identify a reviewer.
//  */
// const express = require("express");
// const { rateLimit } = require("express-rate-limit");
// const { createClient } = require("@supabase/supabase-js");
// const verifyGoogleMobile = require("../middleware/verifyGoogleMobile");
// const firebaseAdmin = require("../firebase");

// const router = express.Router();
// const requireStudentSession = verifyGoogleMobile(firebaseAdmin);
// const feedbackLimit = rateLimit({ windowMs: 10 * 60 * 1000, limit: 10, standardHeaders: "draft-8", legacyHeaders: false });

// const supabaseUrl = process.env.SUPABASE_URL;
// const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
// if (!supabaseUrl || !serviceRoleKey) {
//   throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on the backend before enabling orientation feedback.");
// }
// const db = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
// const TABLE = "orientation_feedback";

// function verifiedEmail(req) {
//   // MUST be populated by server-authenticated middleware, not by request body.
//   return String(req.googleIdentity?.email || "").toLowerCase().trim();
// }

// async function readSummary() {
//   const { data, error } = await db.from(TABLE).select("rating");
//   if (error) throw error;
//   const count = data?.length || 0;
//   const sum = (data || []).reduce((total, row) => total + Number(row.rating), 0);
//   return { count, average: count ? Math.round((sum / count) * 10) / 10 : null };
// }

// // Public aggregate only. Do not expose students' emails or comments.
// router.get("/", async (_req, res) => {
//   try {
//     res.set("Cache-Control", "no-store");
//     return res.json({ summary: await readSummary() });
//   } catch (error) {
//     console.error("Orientation feedback summary error:", error);
//     return res.status(503).json({ error: "Feedback temporarily unavailable" });
//   }
// });

// router.get("/me", requireStudentSession, async (req, res) => {
//   const email = verifiedEmail(req);
//   if (!email) return res.status(401).json({ error: "Verified account required" });
//   try {
//     res.set("Cache-Control", "no-store");
//     const { data, error } = await db.from(TABLE).select("rating, comment").eq("email", email).maybeSingle();
//     if (error) throw error;
//     return res.json({ review: data || null });
//   } catch (error) {
//     console.error("Orientation feedback read error:", error);
//     return res.status(503).json({ error: "Feedback temporarily unavailable" });
//   }
// });

// router.post("/", requireStudentSession, feedbackLimit, async (req, res) => {
//   const email = verifiedEmail(req);
//   if (!email) return res.status(401).json({ error: "Verified account required" });
//   const rating = req.body?.rating;
//   const comment = req.body?.comment;
//   if (!Number.isInteger(rating) || rating < 1 || rating > 5 || typeof comment !== "string" || comment.length > 1000) {
//     return res.status(400).json({ error: "Rating must be 1–5; comment must be text under 1,000 characters" });
//   }
//   try {
//     const { error } = await db.from(TABLE).upsert({ email, rating, comment: comment.trim(), updated_at: new Date().toISOString() }, { onConflict: "email" });
//     if (error) throw error;
//     res.set("Cache-Control", "no-store");
//     return res.json({ saved: true, summary: await readSummary() });
//   } catch (error) {
//     console.error("Orientation feedback save error:", error);
//     return res.status(503).json({ error: "Feedback couldn't be saved" });
//   }
// });

// module.exports = router;
