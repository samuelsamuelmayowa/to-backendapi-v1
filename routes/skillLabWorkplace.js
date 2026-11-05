"use strict";

// Virtual workplace (not a real employer, salary, or cash balance).
// Requires migration 20261027_skill_lab_workplace.sql and the existing JWT auth.
const express = require("express");
const supabase = require("../config/supabaseAdmin.js");
const { requireSkillLabAuth } = require("../middleware/skillLabAuth.js");
const router = express.Router();
router.use(requireSkillLabAuth);

const DAY = 86400000;
const todayUTC = () => new Date().toISOString().slice(0, 10);
const previousMonthUTC = () => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)).toISOString().slice(0, 10);
};

function dbError(error, message = "SkillLab workplace database request failed") {
  if (!error) return;
  const err = new Error(message);
  err.statusCode = 500;
  err.cause = error;
  throw err;
}

async function profileFor(student) {
  const { data, error } = await supabase.from("skill_lab_profiles")
    .select("id,full_name,email")
    .eq("external_user_id", student.externalUserId)
    .maybeSingle();
  dbError(error);
  return data;
}

async function activeJob(profileId) {
  const { data, error } = await supabase.from("skill_lab_employments")
    .select("id,profile_id,job_level,virtual_salary,started_at,status,skill_lab_roles(slug,title),skill_lab_companies(name)")
    .eq("profile_id", profileId).eq("status", "active").maybeSingle();
  dbError(error);
  return data;
}

// Concurrent safe: database RPC locks the offer, creates the employment, then accepts the offer atomically.
router.post("/offers/:offerId/accept", async (req, res, next) => {
  try {
    const profile = await profileFor(req.skillLabUser);
    if (!profile) return res.status(403).json({ message: "Complete your interview first." });
    if (!/^[0-9a-f-]{36}$/i.test(req.params.offerId)) return res.status(400).json({ message: "Invalid offer ID." });
    const { data, error } = await supabase.rpc("skill_lab_accept_offer", {
      p_profile_id: profile.id,
      p_offer_id: req.params.offerId,
    });
    if (error) {
      if (error.code === "P0001" || error.code === "23505") return res.status(409).json({ message: error.message });
      dbError(error, "Unable to accept the virtual offer.");
    }
    return res.status(201).json({ employmentId: data.employmentId, message: "Welcome to your virtual workplace!" });
  } catch (error) {
  console.error("SkillLab offer acceptance failed:", {
    message: error.message,
    code: error.code || error.cause?.code,
    details: error.details || error.cause?.details,
    hint: error.hint || error.cause?.hint,
  });

  return next(error);
}; 
});

// Each UTC day, employees get two fresh tickets from their role's scenario bank.
async function assignDailyTasks(employment) {
  const date = todayUTC();
  const roleSlug = employment.skill_lab_roles?.slug;
  const { data: templates, error } = await supabase.from("skill_lab_task_templates")
    .select("id,role_slug")
    .eq("is_active", true).eq("role_slug", roleSlug).order("id");
  dbError(error, "Unable to load workplace scenario templates.");
  if (!templates?.length) return;
  const dayNumber = Math.floor(Date.parse(`${date}T00:00:00Z`) / DAY);
  const start = (dayNumber * 2) % templates.length;
  const selected = Array.from({ length: Math.min(2, templates.length) }, (_, idx) => templates[(start + idx) % templates.length]);
  const dueAt = new Date(Date.parse(`${date}T00:00:00Z`) + DAY).toISOString();
  const rows = selected.map((item) => ({
    employment_id: employment.id,
    template_id: item.id,
    assigned_for: date,
    due_at: dueAt,
    status: "assigned",
  }));
  const { error: insertError } = await supabase.from("skill_lab_tasks").upsert(rows, {
    onConflict: "employment_id,template_id,assigned_for", ignoreDuplicates: true,
  });
  dbError(insertError, "Unable to prepare today's assignments.");
}

// Backfilled salary only runs for already-ended months; RPC is idempotent.
async function settlePreviousMonths(employment) {
  const previous = previousMonthUTC();
  const started = employment.started_at?.slice(0, 7);
  if (!started || started > previous.slice(0, 7)) return;
  // Settle the past 12 months at most per page load, for users who were away a long time.
  const startMonth = new Date(`${started}-01T00:00:00Z`);
  const cutoff = new Date(`${previous}T00:00:00Z`);
  const earliest = new Date(Date.UTC(cutoff.getUTCFullYear(), cutoff.getUTCMonth() - 11, 1));
  if (startMonth < earliest) startMonth.setTime(earliest.getTime());
  const months = [];
  while (startMonth <= cutoff && months.length < 12) {
    months.push(startMonth.toISOString().slice(0, 10));
    startMonth.setUTCMonth(startMonth.getUTCMonth() + 1);
  }
  for (const month of months) {
    const { error } = await supabase.rpc("skill_lab_settle_month", {
      p_employment_id: employment.id, p_month: month,
    });
    dbError(error, `Unable to settle virtual payroll for ${month}.`);
  }
}



router.get('/workplace', async (req, res, next) => {
  try {
    const profile = await profileFor(req.skillLabUser);
    if (!profile) {
      return res.status(403).json({
        message: 'Take an interview to unlock SkillLab.',
      });
    }

    const employment = await activeJob(profile.id);
    if (!employment) {
      const { data: offers, error: offerError } = await supabase
        .from('skill_lab_job_offers')
        .select('id,status,job_level,virtual_salary,expires_at,skill_lab_roles(title),skill_lab_companies(name)')
        .eq('profile_id', profile.id)
        .in('status', ['pending', 'offered'])
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(5);
      dbError(offerError);
      return res.json({ employment: null, offers: offers || [] });
    }

    await settlePreviousMonths(employment);
    await assignDailyTasks(employment);

    const [tasks, payroll, wallet] = await Promise.all([
      supabase
        .from('skill_lab_workplace_tasks') // Separate from the older training tasks.
        .select('id,assigned_for,due_at,status,score,feedback,submission_text,spl_query,skill_lab_task_templates(title,category,brief,sample_logs,starter_query,expected_output,difficulty)')
        .eq('employment_id', employment.id)
        .order('assigned_for', { ascending: false })
        .limit(80),
      supabase
        .from('skill_lab_payroll')
        .select('id,pay_month,tasks_completed,credits_paid,paid_at')
        .eq('employment_id', employment.id)
        .order('pay_month', { ascending: false })
        .limit(12),
      supabase
        .from('skill_lab_wallets')
        .select('balance,lifetime_earned,currency')
        .eq('profile_id', profile.id)
        .maybeSingle(),
    ]);

    dbError(tasks.error);
    dbError(payroll.error);
    dbError(wallet.error);

    return res.json({
      employment,
      tasks: tasks.data || [],
      payroll: payroll.data || [],
      wallet: wallet.data || { balance: 0, lifetime_earned: 0, currency: 'TOC' },
      today: todayUTC(),
      monthlyTaskTarget: 20,
      isSimulation: true,
    });
  } catch (error) {
    // Do not log student credentials or JWTs.
    console.error('SkillLab workplace loading failed:', {
      message: error.message,
      code: error.code || error.cause?.code || null,
      details: error.details || error.cause?.details || null,
      hint: error.hint || error.cause?.hint || null,
    });
    return next(error);
  }
});

// router.get("/workplace", async (req, res, next) => {
//   try {
//     const profile = await profileFor(req.skillLabUser);
//     if (!profile) return res.status(403).json({ message: "Take an interview to unlock SkillLab." });
//     const employment = await activeJob(profile.id);
//     if (!employment) {
//       const { data: offers, error: offerError } = await supabase.from("skill_lab_job_offers")
//         .select("id,status,job_level,virtual_salary,expires_at,skill_lab_roles(title),skill_lab_companies(name)")
//         .eq("profile_id", profile.id).in("status", ["pending", "offered"])
//         .gt("expires_at", new Date().toISOString())
//         .order("created_at", { ascending: false }).limit(5);
//       dbError(offerError);
//       return res.json({ employment: null, offers: offers || [] });
//     }
//     await settlePreviousMonths(employment);
//     await assignDailyTasks(employment);
//     const [tasks, payroll, wallet] = await Promise.all([
//       supabase.from("skill_lab_tasks").select("id,assigned_for,due_at,status,score,feedback,submission_text,spl_query,skill_lab_task_templates(title,category,brief,sample_logs,starter_query,expected_output,difficulty)")
//         .eq("employment_id", employment.id).order("assigned_for", { ascending: false }).limit(80),
//       supabase.from("skill_lab_payroll").select("id,pay_month,tasks_completed,credits_paid,paid_at")
//         .eq("employment_id", employment.id).order("pay_month", { ascending: false }).limit(12),
//       supabase.from("skill_lab_wallets").select("balance,lifetime_earned,currency").eq("profile_id", profile.id).maybeSingle(),
//     ]);
//     dbError(tasks.error); dbError(payroll.error); dbError(wallet.error);
//     return res.json({
//       employment,
//       tasks: tasks.data || [],
//       payroll: payroll.data || [],
//       wallet: wallet.data || { balance: 0, lifetime_earned: 0, currency: "TOC" },
//       today: todayUTC(),
//       monthlyTaskTarget: 20,
//       isSimulation: true,
//     });
//   } catch () { next(error); }
// });

function evaluateTask(template, splQuery, report) {
  const query = splQuery.toLowerCase();
  const notes = report.toLowerCase();
  const rule = template?.rubric || {};
  const splTerms = Array.isArray(rule.spl_terms) ? rule.spl_terms : [];
  const reportTerms = Array.isArray(rule.report_terms) ? rule.report_terms : [];
  const splMatched = splTerms.filter((term) => query.includes(String(term).toLowerCase()));
  const reportMatched = reportTerms.filter((term) => notes.includes(String(term).toLowerCase()));
  const queryScore = splTerms.length ? 55 * splMatched.length / splTerms.length : 55;
  const reportScore = reportTerms.length ? 30 * reportMatched.length / reportTerms.length : 30;
  const clarityScore = report.trim().length >= 100 ? 15 : report.trim().length >= 50 ? 8 : 0;
  const score = Math.round(queryScore + reportScore + clarityScore);
  const feedback = {
    summary: score >= 70 ? "Good investigation. Your work meets the simulator's automated checklist." : "Revise the query and report using the evidence provided.",
    queryChecks: `${splMatched.length}/${splTerms.length}`,
    reportChecks: `${reportMatched.length}/${reportTerms.length}`,
    writingTip: report.trim().length < 100 ? "Write a report of at least 100 characters with evidence and next actions." : "Clear explanation received.",
    note: "Automated practice feedback; not a human evaluation or live Splunk execution.",
  };
  return { score, feedback, status: score >= 70 ? "completed" : "needs_revision" };
}

router.post("/workplace/tasks/:taskId/submit", async (req, res, next) => {
  try {
    const profile = await profileFor(req.skillLabUser);
    if (!profile) return res.status(403).json({ message: "Please complete an interview first." });
    const employment = await activeJob(profile.id);
    if (!employment) return res.status(403).json({ message: "Accept a virtual job offer to access work tickets." });
    if (!/^[0-9a-f-]{36}$/i.test(req.params.taskId)) return res.status(400).json({ message: "Invalid ticket ID." });
    const splQuery = typeof req.body.splQuery === "string" ? req.body.splQuery.trim() : "";
    const report = typeof req.body.report === "string" ? req.body.report.trim() : "";
    if (!splQuery || !report || splQuery.length > 6000 || report.length > 10000) {
      return res.status(400).json({ message: "Enter a search query and report (maximum 6,000 and 10,000 characters)." });
    }
    const { data: task, error } = await supabase.from("skill_lab_tasks")
      .select("id,status,due_at,assigned_for,skill_lab_task_templates(rubric)")
      .eq("id", req.params.taskId).eq("employment_id", employment.id).maybeSingle();
    dbError(error);
    if (!task) return res.status(404).json({ message: "Ticket not found in your workplace." });
    if (task.status === "completed") return res.status(409).json({ message: "This task is already completed." });
    if (new Date(task.due_at).getTime() < Date.now()) return res.status(410).json({ message: "This ticket has passed its deadline." });
    const assessed = evaluateTask(task.skill_lab_task_templates, splQuery, report);
    const { data: updated, error: updateError } = await supabase.from("skill_lab_tasks")
      .update({ status: assessed.status, score: assessed.score, feedback: assessed.feedback,
        spl_query: splQuery, submission_text: report, submitted_at: new Date().toISOString() })
      .eq("id", task.id).eq("employment_id", employment.id).neq("status", "completed")
      .select("id,status,score,feedback").maybeSingle();
    dbError(updateError);
    if (!updated) return res.status(409).json({ message: "Ticket has already been completed." });
    return res.json({ task: updated });
  } catch (error) { next(error); }
});

// Export pure helpers so the automatic assessment can be unit tested without credentials.
router.evaluateTask = evaluateTask;
module.exports = router;
