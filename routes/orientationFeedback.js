"use strict";
/**
 * Example Express backend for the rating UI.
 * Adjust paths to match YOUR backend directory structure, and register with:
 * app.use('/api/orientation-feedback', require('./routes/orientationFeedback'));
 *
 * This example uses the SAME Google/Firebase verification middleware shown in
 * your Splunk alert route. Confirm the website supplies a compatible ID token.
 * The server MUST NOT accept a client-submitted email to identify a reviewer.
 */
const express = require("express");
const { rateLimit } = require("express-rate-limit");
const { createClient } = require("@supabase/supabase-js");
const verifyGoogleMobile = require("../middleware/verifyGoogleMobile");
const firebaseAdmin = require("../firebase");

const router = express.Router();
const requireStudentSession = verifyGoogleMobile(firebaseAdmin);
const feedbackLimit = rateLimit({ windowMs: 10 * 60 * 1000, limit: 10, standardHeaders: "draft-8", legacyHeaders: false });

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on the backend before enabling orientation feedback.");
}
const db = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
const TABLE = "orientation_feedback";

function verifiedEmail(req) {
  // MUST be populated by server-authenticated middleware, not by request body.
  return String(req.googleIdentity?.email || "").toLowerCase().trim();
}

async function readSummary() {
  const { data, error } = await db.from(TABLE).select("rating");
  if (error) throw error;
  const count = data?.length || 0;
  const sum = (data || []).reduce((total, row) => total + Number(row.rating), 0);
  return { count, average: count ? Math.round((sum / count) * 10) / 10 : null };
}

// Public aggregate only. Do not expose students' emails or comments.
router.get("/", async (_req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    return res.json({ summary: await readSummary() });
  } catch (error) {
    console.error("Orientation feedback summary error:", error);
    return res.status(503).json({ error: "Feedback temporarily unavailable" });
  }
});

router.get("/me", requireStudentSession, async (req, res) => {
  const email = verifiedEmail(req);
  if (!email) return res.status(401).json({ error: "Verified account required" });
  try {
    res.set("Cache-Control", "no-store");
    const { data, error } = await db.from(TABLE).select("rating, comment").eq("email", email).maybeSingle();
    if (error) throw error;
    return res.json({ review: data || null });
  } catch (error) {
    console.error("Orientation feedback read error:", error);
    return res.status(503).json({ error: "Feedback temporarily unavailable" });
  }
});

router.post("/", requireStudentSession, feedbackLimit, async (req, res) => {
  const email = verifiedEmail(req);
  if (!email) return res.status(401).json({ error: "Verified account required" });
  const rating = req.body?.rating;
  const comment = req.body?.comment;
  if (!Number.isInteger(rating) || rating < 1 || rating > 5 || typeof comment !== "string" || comment.length > 1000) {
    return res.status(400).json({ error: "Rating must be 1–5; comment must be text under 1,000 characters" });
  }
  try {
    const { error } = await db.from(TABLE).upsert({ email, rating, comment: comment.trim(), updated_at: new Date().toISOString() }, { onConflict: "email" });
    if (error) throw error;
    res.set("Cache-Control", "no-store");
    return res.json({ saved: true, summary: await readSummary() });
  } catch (error) {
    console.error("Orientation feedback save error:", error);
    return res.status(503).json({ error: "Feedback couldn't be saved" });
  }
});

module.exports = router;
