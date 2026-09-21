const crypto = require("crypto");
const SplunkCase = require("../model/SplunkCase");
const SplunkAttempt = require("../model/SplunkAttempt");
const { executeSpl, SplError } = require("../services/splEngine");

const publicCase = "slug code title subtitle briefing difficulty duration index sourcetype fields missions.key missions.title missions.instruction missions.points missions.hints missions.explanation";

exports.listCases = async (req, res, next) => {
  try {
    const cases = await SplunkCase.find({ published: true }).select(publicCase).lean();
    res.json({ data: cases });
  } catch (error) { next(error); }
};

exports.getCase = async (req, res, next) => {
  try {
    const item = await SplunkCase.findOne({ slug: req.params.slug, published: true }).select(`${publicCase} +events`).lean();
    if (!item) return res.status(404).json({ message: "Splunk case not found." });
    res.json({ data: item });
  } catch (error) { next(error); }
};

exports.startAttempt = async (req, res, next) => {
  try {
    const item = await SplunkCase.findOne({ slug: req.params.slug, published: true }).select("_id");
    if (!item) return res.status(404).json({ message: "Splunk case not found." });
    const guestId = String(req.body.guestId || crypto.randomUUID()).slice(0, 100);
    const attempt = await SplunkAttempt.create({ caseId: item._id, guestId });
    res.status(201).json({ data: { attemptId: attempt._id, guestId } });
  } catch (error) { next(error); }
};

exports.runSearch = async (req, res, next) => {
  try {
    const attempt = await SplunkAttempt.findById(req.params.attemptId);

    if (!attempt) {
      return res.status(404).json({
        message: "Attempt not found.",
      });
    }

    if (attempt.guestId !== req.body.guestId) {
      return res.status(403).json({
        message: "This attempt belongs to another visitor.",
      });
    }

    // Internal query: load events and expected answers for grading.
    const item = await SplunkCase.findById(attempt.caseId)
      .setOptions({ schemaLevelProjections: false })
      .lean();

    if (!item) {
      return res.status(404).json({
        message: "Splunk case not found.",
      });
    }

    const mission = item.missions.find(
      (entry) => entry.key === req.body.missionKey
    );

    if (!mission) {
      return res.status(404).json({
        message: "Mission not found.",
      });
    }

    if (!mission.expectedQuery) {
      return res.status(500).json({
        message: "This mission does not have a grading query.",
      });
    }

    const submittedQuery = String(req.body.query || "").slice(0, 3000);

    const actual = executeSpl(
      item.events,
      submittedQuery,
      item
    );

    const expected = executeSpl(
      item.events,
      mission.expectedQuery,
      item
    );

    const passed =
      JSON.stringify(actual.rows) === JSON.stringify(expected.rows);

    attempt.queriesRun += 1;

    if (passed) {
      attempt.completedMissions.set(
        mission.key,
        mission.points
      );
    }

    await attempt.save();

    res.json({
      data: {
        ...actual,
        passed,
        points: passed ? mission.points : 0,
        message: passed
          ? "Mission passed."
          : "The search ran, but the result does not yet match the mission objective.",
      },
    });
  } catch (error) {
    if (error instanceof SplError) {
      return res.status(422).json({
        message: error.message,
        command: error.command,
      });
    }

    next(error);
  }
};
// exports.runSearch = async (req, res, next) => {
//   try {
//     const attempt = await SplunkAttempt.findById(req.params.attemptId);
//     if (!attempt) return res.status(404).json({ message: "Attempt not found." });
//     if (attempt.guestId !== req.body.guestId) return res.status(403).json({ message: "This attempt belongs to another visitor." });
//     const item = await SplunkCase.findById(attempt.caseId).select("+events +missions.expectedQuery index sourcetype missions");
//     const mission = item.missions.find((entry) => entry.key === req.body.missionKey);
//     if (!mission) return res.status(404).json({ message: "Mission not found." });

//     const actual = executeSpl(item.events, String(req.body.query || "").slice(0, 3000), item);
//     const expected = executeSpl(item.events, mission.expectedQuery, item);
//     const passed = JSON.stringify(actual.rows) === JSON.stringify(expected.rows);
//     attempt.queriesRun += 1;
//     if (passed) attempt.completedMissions.set(mission.key, mission.points);
//     await attempt.save();
//     res.json({ data: { ...actual, passed, points: passed ? mission.points : 0, message: passed ? "Mission passed." : "The search ran, but the result does not yet match the mission objective." } });
//   } catch (error) {
//     if (error instanceof SplError) return res.status(422).json({ message: error.message, command: error.command });
//     next(error);
//   }
// };

exports.useHint = async (req, res, next) => {
  try {
    const attempt = await SplunkAttempt.findById(req.params.attemptId);
    if (!attempt || attempt.guestId !== req.body.guestId) return res.status(404).json({ message: "Attempt not found." });
    // const item = await SplunkCase.findById(attempt.caseId).select("missions");
    const item = await SplunkCase.findById(attempt.caseId)
      .setOptions({ schemaLevelProjections: false })
      .lean();

    if (!item) {
      return res.status(404).json({
        message: "Splunk case not found.",
      });
    }
    const mission = item.missions.find((entry) => entry.key === req.body.missionKey);
    if (!mission) return res.status(404).json({ message: "Mission not found." });
    const level = Math.min((attempt.hintsUsed.get(mission.key) || 0) + 1, mission.hints.length);
    attempt.hintsUsed.set(mission.key, level);
    await attempt.save();
    res.json({ data: { level, hint: mission.hints[level - 1] || "No more hints are available." } });
  } catch (error) { next(error); }
};

exports.submitAttempt = async (req, res, next) => {
  try {
    const attempt = await SplunkAttempt.findById(req.params.attemptId).populate("caseId", "missions");
    if (!attempt || attempt.guestId !== req.body.guestId) return res.status(404).json({ message: "Attempt not found." });
    const earned = [...attempt.completedMissions.values()].reduce((sum, value) => sum + value, 0);
    const maximum = attempt.caseId.missions.reduce((sum, mission) => sum + mission.points, 0);
    const hintPenalty = [...attempt.hintsUsed.values()].reduce((sum, value) => sum + value, 0) * 2;
    attempt.score = Math.max(0, Math.round((earned / Math.max(maximum, 1)) * 100) - hintPenalty);
    attempt.status = "completed";
    attempt.completedAt = new Date();
    await attempt.save();
    res.json({ data: { score: attempt.score, status: attempt.status, completedAt: attempt.completedAt } });
  } catch (error) { next(error); }
};
