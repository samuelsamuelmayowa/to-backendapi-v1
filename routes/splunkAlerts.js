"use strict";
const express = require("express");
const { rateLimit } = require("express-rate-limit");
const { createHash } = require("node:crypto");
const { Resend } = require("resend");
const verifyGoogleMobile = require("../middleware/verifyGoogleMobile");
const firebaseAdmin = require("../firebase");
const { validateSimulatedNotification, makeEmail } = require("../services/splunkAlertNotification");

const router = express.Router();
const authenticatedUser = verifyGoogleMobile(firebaseAdmin);
const userRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 4,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: (req) => req.googleIdentity.email,
  message: { message: "Email limit reached. Please try again later." },
});

router.post("/notify", authenticatedUser, userRateLimit, async (req, res) => {
  let alert;
  try { alert = validateSimulatedNotification(req.body); }
  catch (e) { return res.status(400).json({ message: e.message }); }

  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) {
    return res.status(503).json({ message: "Resend is not configured on the backend." });
  }
  const email = req.googleIdentity.email; // Verified Firebase identity, NOT client-supplied recipient.
  const { subject, html, text } = makeEmail(alert);
  // Repeat clicks in a ten-minute window reuse an identical email payload and key.
  // Resend keeps idempotency keys for 24 hours. No browser localStorage is relied on.
  const bucket = Math.floor(Date.now() / 600000);
  const idempotencyKey = `splunk-lab/${createHash("sha256").update(JSON.stringify({ email, alert, bucket })).digest("hex")}`;

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { data, error } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL,
      to: [email],
      subject,
      html,
      text,
    }, { idempotencyKey });
    if (error) {
      console.error("Splunk alert notification provider error:", error.name);
      return res.status(502).json({ message: "Resend could not accept the notification. Try again later." });
    }
    return res.status(200).json({ success: true, emailId: data?.id || null, message: "Notification accepted for delivery." });
  } catch (error) {
    console.error("Splunk alert email unexpected error:", error?.name);
    return res.status(502).json({ message: "Notification service unavailable. Try again later." });
  }
});
module.exports = router;
