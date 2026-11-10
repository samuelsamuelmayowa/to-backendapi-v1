"use strict";

const express = require("express");
const supabase = require("../config/supabaseAdmin");
const { requireTrustedOrigin, requireSession } = require("../middleware/sessionCookie");
const { checkQuizAccess } = require("../services/studentAccess");

const router = express.Router();

async function requireStockQuizAccess(req, res) {
  const email = String(req.authClaims?.email || "").trim().toLowerCase();
  if (!email || !email.includes("@")) {
    res.status(401).json({ message: "Please sign in again." });
    return false;
  }
  try {
    const access = await checkQuizAccess(email, "stock-quiz");
    if (access) return true;
    res.status(403).json({ message: "The Stocks & Options Quiz Center has not been assigned to your account." });
    return false;
  } catch (error) {
    console.error("Stocks & Options quiz access check failed:", error.message);
    res.status(503).json({ message: "Quiz access could not be checked." });
    return false;
  }
}

router.get("/stock-quizzes", requireTrustedOrigin, requireSession, async (req, res) => {
  if (!(await requireStockQuizAccess(req, res))) return;
  try {
    const { data, error } = await supabase.rpc("list_published_stock_quizzes");
    if (error) throw error;
    res.set("Cache-Control", "no-store");
    return res.status(200).json(data || []);
  } catch (error) {
    console.error("Failed to load Stocks & Options quizzes:", error.message);
    return res.status(503).json({ message: "Quiz list could not be loaded." });
  }
});

router.get("/stock-quizzes/:slug", requireTrustedOrigin, requireSession, async (req, res) => {
  if (!(await requireStockQuizAccess(req, res))) return;
  const slug = String(req.params.slug || "").trim();
  if (!slug || !/^[a-z0-9-]+$/i.test(slug)) return res.status(400).json({ message: "Invalid quiz." });
  try {
    const { data, error } = await supabase.rpc("get_published_stock_quiz", { p_slug: slug });
    if (error) throw error;
    if (!data) return res.status(404).json({ message: "Quiz not found." });
    res.set("Cache-Control", "no-store");
    return res.status(200).json(data);
  } catch (error) {
    console.error("Failed to load Stocks & Options quiz:", error.message);
    return res.status(503).json({ message: "Quiz could not be loaded." });
  }
});

router.post("/stock-quizzes/:quizId/submit", requireTrustedOrigin, requireSession, async (req, res) => {
  if (!(await requireStockQuizAccess(req, res))) return;
  const quizId = String(req.params.quizId || "").trim();
  const answers = req.body?.answers;
  if (!quizId || !/^[a-z0-9-]+$/i.test(quizId) || !answers || typeof answers !== "object" || Array.isArray(answers)) {
    return res.status(400).json({ message: "Quiz answers are invalid." });
  }
  try {
    const email = String(req.authClaims.email).trim().toLowerCase();
    const { data, error } = await supabase.rpc("submit_stock_quiz", {
      p_quiz_id: quizId,
      p_student_email: email,
      p_answers: answers,
    });
    if (error) throw error;
    res.set("Cache-Control", "no-store");
    return res.status(200).json(data);
  } catch (error) {
    console.error("Failed to submit Stocks & Options quiz:", error.message);
    return res.status(503).json({ message: "Quiz answers could not be submitted." });
  }
});

module.exports = router;
