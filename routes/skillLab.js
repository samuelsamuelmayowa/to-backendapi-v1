const express = require("express");
const crypto = require("crypto");

const supabase = require("../config/supabaseAdmin.js");
const { requireSkillLabAuth } = require("../middleware/skillLabAuth.js");

const router = express.Router();
const VALID_LEVELS = new Set(["entry", "mid", "senior"]);

router.use(requireSkillLabAuth);

function shuffle(items) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const randomIndex = crypto.randomInt(index + 1);
    [copy[index], copy[randomIndex]] = [copy[randomIndex], copy[index]];
  }
  return copy;
}

function safeQuestion(question) {
  return {
    id: question.id,
    category: question.category,
    difficulty: question.difficulty,
    prompt: question.prompt,
    options: question.options,
    points: question.points,
    timeLimitSeconds: question.time_limit_seconds,
  };
}

function safeLab(lab) {
  return {
    id: lab.id,
    category: lab.category,
    title: lab.title,
    brief: lab.brief,
    code: lab.starter_code,
    options: lab.options,
    points: lab.points,
  };
}

function throwDatabaseError(error, message) {
  if (!error) return;
  const wrapped = new Error(message || error.message);
  wrapped.statusCode = 500;
  wrapped.cause = error;
  throw wrapped;
}

async function getOrCreateProfile(student) {
  const { data: existing, error: findError } = await supabase
    .from("skill_lab_profiles")
    .select("*")
    .eq("external_user_id", student.externalUserId)
    .maybeSingle();

  throwDatabaseError(findError, "Unable to load the Skill Lab profile.");

  let profile = existing;
  if (!profile) {
    const { data: created, error: createError } = await supabase
      .from("skill_lab_profiles")
      .insert({
        external_user_id: student.externalUserId,
        email: student.email,
        full_name: student.fullName,
      })
      .select("*")
      .single();

    throwDatabaseError(createError, "Unable to create the Skill Lab profile.");
    profile = created;
  } else if (profile.email !== student.email || profile.full_name !== student.fullName) {
    const { data: updated, error: updateError } = await supabase
      .from("skill_lab_profiles")
      .update({ email: student.email, full_name: student.fullName })
      .eq("id", profile.id)
      .select("*")
      .single();

    throwDatabaseError(updateError, "Unable to update the Skill Lab profile.");
    profile = updated;
  }

  const { error: walletError } = await supabase
    .from("skill_lab_wallets")
    .upsert({ profile_id: profile.id }, { onConflict: "profile_id", ignoreDuplicates: true });

  throwDatabaseError(walletError, "Unable to prepare the virtual wallet.");
  return profile;
}

router.get("/profile", async (req, res, next) => {
  try {
    const profile = await getOrCreateProfile(req.skillLabUser);

    const [walletResult, attemptsResult, offersResult, employmentResult] = await Promise.all([
      supabase.from("skill_lab_wallets").select("balance,lifetime_earned,currency").eq("profile_id", profile.id).single(),
      supabase.from("skill_lab_attempts").select("id,score,status,level,started_at,submitted_at,skill_lab_roles(slug,title)").eq("profile_id", profile.id).order("created_at", { ascending: false }).limit(5),
      supabase.from("skill_lab_job_offers").select("id,status,job_level,virtual_salary,expires_at,created_at,skill_lab_roles(slug,title),skill_lab_companies(name)").eq("profile_id", profile.id).order("created_at", { ascending: false }).limit(5),
      supabase.from("skill_lab_employments").select("id,status,job_level,virtual_salary,started_at,skill_lab_roles(slug,title),skill_lab_companies(name)").eq("profile_id", profile.id).eq("status", "active").maybeSingle(),
    ]);

    throwDatabaseError(walletResult.error);
    throwDatabaseError(attemptsResult.error);
    throwDatabaseError(offersResult.error);
    throwDatabaseError(employmentResult.error);

    return res.json({
      profile,
      wallet: walletResult.data,
      recentAttempts: attemptsResult.data || [],
      jobOffers: offersResult.data || [],
      employment: employmentResult.data || null,
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/roles", async (_req, res, next) => {
  try {
    const { data, error } = await supabase
      .from("skill_lab_roles")
      .select("id,slug,title,description,entry_salary_min,entry_salary_max,mid_salary_min,mid_salary_max,senior_salary_min,senior_salary_max")
      .eq("is_active", true)
      .order("title");

    throwDatabaseError(error, "Unable to load Skill Lab roles.");
    return res.json({ roles: data || [] });
  } catch (error) {
    return next(error);
  }
});

router.post("/interviews/start", async (req, res, next) => {
  let attemptId;

  try {
    const roleSlug = String(req.body.role || "").trim().toLowerCase();
    const level = String(req.body.level || "").trim().toLowerCase();

    if (!roleSlug || !VALID_LEVELS.has(level)) {
      return res.status(400).json({ message: "Choose a valid role and experience level." });
    }

    const profile = await getOrCreateProfile(req.skillLabUser);

    const { data: role, error: roleError } = await supabase
      .from("skill_lab_roles")
      .select("id,slug,title,description")
      .eq("slug", roleSlug)
      .eq("is_active", true)
      .maybeSingle();

    throwDatabaseError(roleError, "Unable to load the selected role.");
    if (!role) return res.status(404).json({ message: "The selected role is unavailable." });

    const [{ data: questions, error: questionsError }, { data: labs, error: labsError }] = await Promise.all([
      supabase.from("skill_lab_questions").select("*").eq("is_active", true).or(`role_id.is.null,role_id.eq.${role.id}`).or(`level.is.null,level.eq.${level}`),
      supabase.from("skill_lab_labs").select("*").eq("is_active", true).or(`role_id.is.null,role_id.eq.${role.id}`).or(`level.is.null,level.eq.${level}`),
    ]);

    throwDatabaseError(questionsError, "Unable to load interview questions.");
    throwDatabaseError(labsError, "Unable to load practical labs.");

    const selectedQuestions = shuffle(questions || []).slice(0, 10);
    const selectedLabs = shuffle(labs || []).slice(0, 2);

    if (!selectedQuestions.length || !selectedLabs.length) {
      return res.status(503).json({ message: "This interview is not ready yet. Please try again later." });
    }

    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const { data: attempt, error: attemptError } = await supabase
      .from("skill_lab_attempts")
      .insert({
        profile_id: profile.id,
        role_id: role.id,
        level,
        status: "in_progress",
        interview_total: selectedQuestions.length,
        lab_total: selectedLabs.length,
        expires_at: expiresAt,
      })
      .select("id,started_at,expires_at")
      .single();

    throwDatabaseError(attemptError, "Unable to start the interview.");
    attemptId = attempt.id;

    const questionRows = selectedQuestions.map((question, index) => ({
      attempt_id: attempt.id,
      question_id: question.id,
      display_order: index + 1,
    }));
    const labRows = selectedLabs.map((lab, index) => ({
      attempt_id: attempt.id,
      lab_id: lab.id,
      display_order: index + 1,
    }));

    const [questionInsert, labInsert] = await Promise.all([
      supabase.from("skill_lab_attempt_questions").insert(questionRows),
      supabase.from("skill_lab_attempt_labs").insert(labRows),
    ]);

    throwDatabaseError(questionInsert.error, "Unable to prepare interview questions.");
    throwDatabaseError(labInsert.error, "Unable to prepare practical labs.");

    return res.status(201).json({
      attemptId: attempt.id,
      startedAt: attempt.started_at,
      expiresAt: attempt.expires_at,
      role,
      level,
      questions: selectedQuestions.map(safeQuestion),
      labs: selectedLabs.map(safeLab),
    });
  } catch (error) {
    if (attemptId) {
      await supabase.from("skill_lab_attempts").delete().eq("id", attemptId);
    }
    return next(error);
  }
});

router.post("/interviews/:attemptId/submit", async (req, res, next) => {
  try {
    const profile = await getOrCreateProfile(req.skillLabUser);
    const attemptId = req.params.attemptId;
    const answers = req.body.answers || {};
    const labAnswers = req.body.labAnswers || {};

    const { data: attempt, error: attemptError } = await supabase
      .from("skill_lab_attempts")
      .select("*,skill_lab_roles(*)")
      .eq("id", attemptId)
      .eq("profile_id", profile.id)
      .maybeSingle();

    throwDatabaseError(attemptError, "Unable to load this interview.");
    if (!attempt) return res.status(404).json({ message: "Interview attempt was not found." });
    if (attempt.status !== "in_progress") {
      return res.status(409).json({ message: "This interview has already been submitted." });
    }
    if (attempt.expires_at && new Date(attempt.expires_at).getTime() < Date.now()) {
      await supabase.from("skill_lab_attempts").update({ status: "expired" }).eq("id", attempt.id);
      return res.status(410).json({ message: "This interview has expired. Please start another attempt." });
    }

    const [attemptQuestionsResult, attemptLabsResult] = await Promise.all([
      supabase.from("skill_lab_attempt_questions").select("question_id,display_order").eq("attempt_id", attempt.id).order("display_order"),
      supabase.from("skill_lab_attempt_labs").select("lab_id,display_order").eq("attempt_id", attempt.id).order("display_order"),
    ]);
    throwDatabaseError(attemptQuestionsResult.error);
    throwDatabaseError(attemptLabsResult.error);

    const questionIds = attemptQuestionsResult.data.map((item) => item.question_id);
    const labIds = attemptLabsResult.data.map((item) => item.lab_id);
    const [questionsResult, labsResult] = await Promise.all([
      supabase.from("skill_lab_questions").select("id,category,prompt,options,correct_option,explanation,points").in("id", questionIds),
      supabase.from("skill_lab_labs").select("id,category,title,options,correct_option,explanation,points").in("id", labIds),
    ]);
    throwDatabaseError(questionsResult.error);
    throwDatabaseError(labsResult.error);

    const questionsById = new Map(questionsResult.data.map((item) => [item.id, item]));
    const labsById = new Map(labsResult.data.map((item) => [item.id, item]));
    let earnedPoints = 0;
    let availablePoints = 0;
    let interviewCorrect = 0;
    let labCorrect = 0;
    const categoryTotals = new Map();
    const questionUpdates = [];
    const labUpdates = [];
    const review = [];

    for (const row of attemptQuestionsResult.data) {
      const question = questionsById.get(row.question_id);
      if (!question) continue;
      const selected = Number.isInteger(answers[question.id]) ? answers[question.id] : null;
      const correct = selected === question.correct_option;
      availablePoints += question.points;
      if (correct) {
        earnedPoints += question.points;
        interviewCorrect += 1;
      }
      const category = categoryTotals.get(question.category) || { earned: 0, total: 0 };
      category.total += question.points;
      if (correct) category.earned += question.points;
      categoryTotals.set(question.category, category);
      questionUpdates.push(
        supabase.from("skill_lab_attempt_questions").update({ selected_option: selected, is_correct: correct, answered_at: new Date().toISOString() }).eq("attempt_id", attempt.id).eq("question_id", question.id)
      );
      review.push({
        id: question.id,
        type: "question",
        prompt: question.prompt,
        options: question.options,
        selectedOption: selected,
        correctOption: question.correct_option,
        correct,
        explanation: question.explanation,
      });
    }

    for (const row of attemptLabsResult.data) {
      const lab = labsById.get(row.lab_id);
      if (!lab) continue;
      const selected = Number.isInteger(labAnswers[lab.id]) ? labAnswers[lab.id] : null;
      const correct = selected === lab.correct_option;
      availablePoints += lab.points;
      if (correct) {
        earnedPoints += lab.points;
        labCorrect += 1;
      }
      labUpdates.push(
        supabase.from("skill_lab_attempt_labs").update({ selected_option: selected, is_correct: correct, answered_at: new Date().toISOString() }).eq("attempt_id", attempt.id).eq("lab_id", lab.id)
      );
      review.push({
        id: lab.id,
        type: "lab",
        prompt: lab.title,
        options: lab.options,
        selectedOption: selected,
        correctOption: lab.correct_option,
        correct,
        explanation: lab.explanation,
      });
    }

    const updates = await Promise.all([...questionUpdates, ...labUpdates]);
    const failedUpdate = updates.find((result) => result.error);
    throwDatabaseError(failedUpdate && failedUpdate.error, "Unable to save all interview answers.");

    const score = availablePoints ? Math.round((earnedPoints / availablePoints) * 100) : 0;
    const categoryScores = [...categoryTotals.entries()].map(([category, value]) => ({
      category,
      score: value.total ? Math.round((value.earned / value.total) * 100) : 0,
    }));
    const submittedAt = new Date().toISOString();

    const { error: updateAttemptError } = await supabase
      .from("skill_lab_attempts")
      .update({
        status: "submitted",
        score,
        interview_correct: interviewCorrect,
        lab_correct: labCorrect,
        category_scores: categoryScores,
        submitted_at: submittedAt,
      })
      .eq("id", attempt.id)
      .eq("status", "in_progress");
    throwDatabaseError(updateAttemptError, "Unable to complete the interview.");

    let jobOffer = null;
    if (score >= 70) {
      const { data: company, error: companyError } = await supabase
        .from("skill_lab_companies")
        .select("id,name")
        .eq("is_active", true)
        .limit(1)
        .single();
      throwDatabaseError(companyError, "Unable to prepare the job offer.");

      const jobLevel = score >= 90 && attempt.level === "senior"
        ? "senior"
        : score >= 80
          ? "analyst"
          : "junior";
      const virtualSalary = jobLevel === "senior" ? 9000 : jobLevel === "analyst" ? 6500 : 4000;

      const { data: offer, error: offerError } = await supabase
        .from("skill_lab_job_offers")
        .insert({
          profile_id: profile.id,
          attempt_id: attempt.id,
          company_id: company.id,
          role_id: attempt.role_id,
          job_level: jobLevel,
          virtual_salary: virtualSalary,
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        })
        .select("id,status,job_level,virtual_salary,expires_at")
        .single();
      throwDatabaseError(offerError, "Unable to create the job offer.");
      jobOffer = { ...offer, company: company.name };
    }

    return res.json({
      attemptId: attempt.id,
      score,
      interviewCorrect,
      interviewTotal: attempt.interview_total,
      labCorrect,
      labTotal: attempt.lab_total,
      categoryScores,
      outcome:
        score >= 85
          ? "Strong hire recommendation"
          : score >= 70
            ? "Recommended to progress"
            : score >= 50
              ? "Nearly job-ready"
              : "More practice recommended",
      jobOffer,
      review,
      submittedAt,
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;


// const express = require("express");
// const crypto = require("crypto");

// const supabase = require("../config/supabaseAdmin.js");
// const { requireSkillLabAuth } = require("../middleware/skillLabAuth.js");

// const router = express.Router();
// const VALID_LEVELS = new Set(["entry", "mid", "senior"]);

// router.use(requireSkillLabAuth);

// function shuffle(items) {
//   const copy = [...items];
//   for (let index = copy.length - 1; index > 0; index -= 1) {
//     const randomIndex = crypto.randomInt(index + 1);
//     [copy[index], copy[randomIndex]] = [copy[randomIndex], copy[index]];
//   }
//   return copy;
// }

// function safeQuestion(question) {
//   return {
//     id: question.id,
//     category: question.category,
//     difficulty: question.difficulty,
//     prompt: question.prompt,
//     options: question.options,
//     points: question.points,
//     timeLimitSeconds: question.time_limit_seconds,
//   };
// }

// function safeLab(lab) {
//   return {
//     id: lab.id,
//     category: lab.category,
//     title: lab.title,
//     brief: lab.brief,
//     code: lab.starter_code,
//     options: lab.options,
//     points: lab.points,
//   };
// }

// function throwDatabaseError(error, message) {
//   if (!error) return;
//   const wrapped = new Error(message || error.message);
//   wrapped.statusCode = 500;
//   wrapped.cause = error;
//   throw wrapped;
// }

// async function getOrCreateProfile(student) {
//   const { data: existing, error: findError } = await supabase
//     .from("skill_lab_profiles")
//     .select("*")
//     .eq("external_user_id", student.externalUserId)
//     .maybeSingle();

//   throwDatabaseError(findError, "Unable to load the Skill Lab profile.");

//   let profile = existing;
//   if (!profile) {
//     const { data: created, error: createError } = await supabase
//       .from("skill_lab_profiles")
//       .insert({
//         external_user_id: student.externalUserId,
//         email: student.email,
//         full_name: student.fullName,
//       })
//       .select("*")
//       .single();

//     throwDatabaseError(createError, "Unable to create the Skill Lab profile.");
//     profile = created;
//   } else if (profile.email !== student.email || profile.full_name !== student.fullName) {
//     const { data: updated, error: updateError } = await supabase
//       .from("skill_lab_profiles")
//       .update({ email: student.email, full_name: student.fullName })
//       .eq("id", profile.id)
//       .select("*")
//       .single();

//     throwDatabaseError(updateError, "Unable to update the Skill Lab profile.");
//     profile = updated;
//   }

//   const { error: walletError } = await supabase
//     .from("skill_lab_wallets")
//     .upsert({ profile_id: profile.id }, { onConflict: "profile_id", ignoreDuplicates: true });

//   throwDatabaseError(walletError, "Unable to prepare the virtual wallet.");
//   return profile;
// }

// router.get("/profile", async (req, res, next) => {
//   try {
//     const profile = await getOrCreateProfile(req.skillLabUser);

//     const [walletResult, attemptsResult, offersResult, employmentResult] = await Promise.all([
//       supabase.from("skill_lab_wallets").select("balance,lifetime_earned,currency").eq("profile_id", profile.id).single(),
//       supabase.from("skill_lab_attempts").select("id,score,status,level,started_at,submitted_at,skill_lab_roles(slug,title)").eq("profile_id", profile.id).order("created_at", { ascending: false }).limit(5),
//       supabase.from("skill_lab_job_offers").select("id,status,job_level,virtual_salary,expires_at,created_at,skill_lab_roles(slug,title),skill_lab_companies(name)").eq("profile_id", profile.id).order("created_at", { ascending: false }).limit(5),
//       supabase.from("skill_lab_employments").select("id,status,job_level,virtual_salary,started_at,skill_lab_roles(slug,title),skill_lab_companies(name)").eq("profile_id", profile.id).eq("status", "active").maybeSingle(),
//     ]);

//     throwDatabaseError(walletResult.error);
//     throwDatabaseError(attemptsResult.error);
//     throwDatabaseError(offersResult.error);
//     throwDatabaseError(employmentResult.error);

//     return res.json({
//       profile,
//       wallet: walletResult.data,
//       recentAttempts: attemptsResult.data || [],
//       jobOffers: offersResult.data || [],
//       employment: employmentResult.data || null,
//     });
//   } catch (error) {
//     return next(error);
//   }
// });

// router.get("/roles", async (_req, res, next) => {
//   try {
//     const { data, error } = await supabase
//       .from("skill_lab_roles")
//       .select("id,slug,title,description,entry_salary_min,entry_salary_max,mid_salary_min,mid_salary_max,senior_salary_min,senior_salary_max")
//       .eq("is_active", true)
//       .order("title");

//     throwDatabaseError(error, "Unable to load Skill Lab roles.");
//     return res.json({ roles: data || [] });
//   } catch (error) {
//     return next(error);
//   }
// });

// router.post("/interviews/start", async (req, res, next) => {
//   let attemptId;

//   try {
//     const roleSlug = String(req.body.role || "").trim().toLowerCase();
//     const level = String(req.body.level || "").trim().toLowerCase();

//     if (!roleSlug || !VALID_LEVELS.has(level)) {
//       return res.status(400).json({ message: "Choose a valid role and experience level." });
//     }

//     const profile = await getOrCreateProfile(req.skillLabUser);

//     const { data: role, error: roleError } = await supabase
//       .from("skill_lab_roles")
//       .select("id,slug,title,description")
//       .eq("slug", roleSlug)
//       .eq("is_active", true)
//       .maybeSingle();

//     throwDatabaseError(roleError, "Unable to load the selected role.");
//     if (!role) return res.status(404).json({ message: "The selected role is unavailable." });

//     const [{ data: questions, error: questionsError }, { data: labs, error: labsError }] = await Promise.all([
//       supabase.from("skill_lab_questions").select("*").eq("is_active", true).or(`role_id.is.null,role_id.eq.${role.id}`).or(`level.is.null,level.eq.${level}`),
//       supabase.from("skill_lab_labs").select("*").eq("is_active", true).or(`role_id.is.null,role_id.eq.${role.id}`).or(`level.is.null,level.eq.${level}`),
//     ]);

//     throwDatabaseError(questionsError, "Unable to load interview questions.");
//     throwDatabaseError(labsError, "Unable to load practical labs.");

//     const selectedQuestions = shuffle(questions || []).slice(0, 10);
//     const selectedLabs = shuffle(labs || []).slice(0, 2);

//     if (!selectedQuestions.length || !selectedLabs.length) {
//       return res.status(503).json({ message: "This interview is not ready yet. Please try again later." });
//     }

//     const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
//     const { data: attempt, error: attemptError } = await supabase
//       .from("skill_lab_attempts")
//       .insert({
//         profile_id: profile.id,
//         role_id: role.id,
//         level,
//         status: "in_progress",
//         interview_total: selectedQuestions.length,
//         lab_total: selectedLabs.length,
//         expires_at: expiresAt,
//       })
//       .select("id,started_at,expires_at")
//       .single();

//     throwDatabaseError(attemptError, "Unable to start the interview.");
//     attemptId = attempt.id;

//     const questionRows = selectedQuestions.map((question, index) => ({
//       attempt_id: attempt.id,
//       question_id: question.id,
//       display_order: index + 1,
//     }));
//     const labRows = selectedLabs.map((lab, index) => ({
//       attempt_id: attempt.id,
//       lab_id: lab.id,
//       display_order: index + 1,
//     }));

//     const [questionInsert, labInsert] = await Promise.all([
//       supabase.from("skill_lab_attempt_questions").insert(questionRows),
//       supabase.from("skill_lab_attempt_labs").insert(labRows),
//     ]);

//     throwDatabaseError(questionInsert.error, "Unable to prepare interview questions.");
//     throwDatabaseError(labInsert.error, "Unable to prepare practical labs.");

//     return res.status(201).json({
//       attemptId: attempt.id,
//       startedAt: attempt.started_at,
//       expiresAt: attempt.expires_at,
//       role,
//       level,
//       questions: selectedQuestions.map(safeQuestion),
//       labs: selectedLabs.map(safeLab),
//     });
//   } catch (error) {
//     if (attemptId) {
//       await supabase.from("skill_lab_attempts").delete().eq("id", attemptId);
//     }
//     return next(error);
//   }
// });

// router.post("/interviews/:attemptId/submit", async (req, res, next) => {
//   try {
//     const profile = await getOrCreateProfile(req.skillLabUser);
//     const attemptId = req.params.attemptId;
//     const answers = req.body.answers || {};
//     const labAnswers = req.body.labAnswers || {};

//     const { data: attempt, error: attemptError } = await supabase
//       .from("skill_lab_attempts")
//       .select("*,skill_lab_roles(*)")
//       .eq("id", attemptId)
//       .eq("profile_id", profile.id)
//       .maybeSingle();

//     throwDatabaseError(attemptError, "Unable to load this interview.");
//     if (!attempt) return res.status(404).json({ message: "Interview attempt was not found." });
//     if (attempt.status !== "in_progress") {
//       return res.status(409).json({ message: "This interview has already been submitted." });
//     }
//     if (attempt.expires_at && new Date(attempt.expires_at).getTime() < Date.now()) {
//       await supabase.from("skill_lab_attempts").update({ status: "expired" }).eq("id", attempt.id);
//       return res.status(410).json({ message: "This interview has expired. Please start another attempt." });
//     }

//     const [attemptQuestionsResult, attemptLabsResult] = await Promise.all([
//       supabase.from("skill_lab_attempt_questions").select("question_id,display_order").eq("attempt_id", attempt.id).order("display_order"),
//       supabase.from("skill_lab_attempt_labs").select("lab_id,display_order").eq("attempt_id", attempt.id).order("display_order"),
//     ]);
//     throwDatabaseError(attemptQuestionsResult.error);
//     throwDatabaseError(attemptLabsResult.error);

//     const questionIds = attemptQuestionsResult.data.map((item) => item.question_id);
//     const labIds = attemptLabsResult.data.map((item) => item.lab_id);
//     const [questionsResult, labsResult] = await Promise.all([
//       supabase.from("skill_lab_questions").select("id,category,prompt,options,correct_option,explanation,points").in("id", questionIds),
//       supabase.from("skill_lab_labs").select("id,category,title,options,correct_option,explanation,points").in("id", labIds),
//     ]);
//     throwDatabaseError(questionsResult.error);
//     throwDatabaseError(labsResult.error);

//     const questionsById = new Map(questionsResult.data.map((item) => [item.id, item]));
//     const labsById = new Map(labsResult.data.map((item) => [item.id, item]));
//     let earnedPoints = 0;
//     let availablePoints = 0;
//     let interviewCorrect = 0;
//     let labCorrect = 0;
//     const categoryTotals = new Map();
//     const questionUpdates = [];
//     const labUpdates = [];
//     const review = [];

//     for (const row of attemptQuestionsResult.data) {
//       const question = questionsById.get(row.question_id);
//       if (!question) continue;
//       const selected = Number.isInteger(answers[question.id]) ? answers[question.id] : null;
//       const correct = selected === question.correct_option;
//       availablePoints += question.points;
//       if (correct) {
//         earnedPoints += question.points;
//         interviewCorrect += 1;
//       }
//       const category = categoryTotals.get(question.category) || { earned: 0, total: 0 };
//       category.total += question.points;
//       if (correct) category.earned += question.points;
//       categoryTotals.set(question.category, category);
//       questionUpdates.push(
//         supabase.from("skill_lab_attempt_questions").update({ selected_option: selected, is_correct: correct, answered_at: new Date().toISOString() }).eq("attempt_id", attempt.id).eq("question_id", question.id)
//       );
//       review.push({
//         id: question.id,
//         type: "question",
//         prompt: question.prompt,
//         selectedOption: selected,
//         correctOption: question.correct_option,
//         correct,
//         explanation: question.explanation,
//       });
//     }

//     for (const row of attemptLabsResult.data) {
//       const lab = labsById.get(row.lab_id);
//       if (!lab) continue;
//       const selected = Number.isInteger(labAnswers[lab.id]) ? labAnswers[lab.id] : null;
//       const correct = selected === lab.correct_option;
//       availablePoints += lab.points;
//       if (correct) {
//         earnedPoints += lab.points;
//         labCorrect += 1;
//       }
//       labUpdates.push(
//         supabase.from("skill_lab_attempt_labs").update({ selected_option: selected, is_correct: correct, answered_at: new Date().toISOString() }).eq("attempt_id", attempt.id).eq("lab_id", lab.id)
//       );
//       review.push({
//         id: lab.id,
//         type: "lab",
//         prompt: lab.title,
//         selectedOption: selected,
//         correctOption: lab.correct_option,
//         correct,
//         explanation: lab.explanation,
//       });
//     }

//     const updates = await Promise.all([...questionUpdates, ...labUpdates]);
//     const failedUpdate = updates.find((result) => result.error);
//     throwDatabaseError(failedUpdate && failedUpdate.error, "Unable to save all interview answers.");

//     const score = availablePoints ? Math.round((earnedPoints / availablePoints) * 100) : 0;
//     const categoryScores = [...categoryTotals.entries()].map(([category, value]) => ({
//       category,
//       score: value.total ? Math.round((value.earned / value.total) * 100) : 0,
//     }));
//     const submittedAt = new Date().toISOString();

//     const { error: updateAttemptError } = await supabase
//       .from("skill_lab_attempts")
//       .update({
//         status: "submitted",
//         score,
//         interview_correct: interviewCorrect,
//         lab_correct: labCorrect,
//         category_scores: categoryScores,
//         submitted_at: submittedAt,
//       })
//       .eq("id", attempt.id)
//       .eq("status", "in_progress");
//     throwDatabaseError(updateAttemptError, "Unable to complete the interview.");

//     let jobOffer = null;
//     if (score >= 70) {
//       const { data: company, error: companyError } = await supabase
//         .from("skill_lab_companies")
//         .select("id,name")
//         .eq("is_active", true)
//         .limit(1)
//         .single();
//       throwDatabaseError(companyError, "Unable to prepare the job offer.");

//       const jobLevel = score >= 90 && attempt.level === "senior"
//         ? "senior"
//         : score >= 80
//           ? "analyst"
//           : "junior";
//       const virtualSalary = jobLevel === "senior" ? 9000 : jobLevel === "analyst" ? 6500 : 4000;

//       const { data: offer, error: offerError } = await supabase
//         .from("skill_lab_job_offers")
//         .insert({
//           profile_id: profile.id,
//           attempt_id: attempt.id,
//           company_id: company.id,
//           role_id: attempt.role_id,
//           job_level: jobLevel,
//           virtual_salary: virtualSalary,
//           expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
//         })
//         .select("id,status,job_level,virtual_salary,expires_at")
//         .single();
//       throwDatabaseError(offerError, "Unable to create the job offer.");
//       jobOffer = { ...offer, company: company.name };
//     }

//     return res.json({
//       attemptId: attempt.id,
//       score,
//       interviewCorrect,
//       interviewTotal: attempt.interview_total,
//       labCorrect,
//       labTotal: attempt.lab_total,
//       categoryScores,
//       outcome:
//         score >= 85
//           ? "Strong hire recommendation"
//           : score >= 70
//             ? "Recommended to progress"
//             : score >= 50
//               ? "Nearly job-ready"
//               : "More practice recommended",
//       jobOffer,
//       review,
//       submittedAt,
//     });
//   } catch (error) {
//     return next(error);
//   }
// });

// module.exports = router;
