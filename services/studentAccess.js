"use strict";

const StudentAccess = require("../model/studentAccess");
const User = require("../model/user");

const RESOURCES = [
  { id: "course:splunk", type: "course", title: "Splunk Training" },
  { id: "course:stock-options", type: "course", title: "Stocks & Options" },
  { id: "quiz:power-user", type: "quiz", title: "Power User Practice Exam" },
  { id: "quiz:admin", type: "quiz", title: "Splunk Admin Practice Exam" },
  { id: "quiz:splk-2002", type: "quiz", title: "SPLK-2002 Practice Quiz" },
  { id: "quiz:stock-quiz", type: "quiz", title: "Stocks & Options Quiz Center" },
];

const RESOURCE_BY_ID = new Map(RESOURCES.map((resource) => [resource.id, resource]));
const RESOURCE_IDS = new Set(RESOURCE_BY_ID.keys());
const COURSE_ID_ALIASES = new Map([
  ["splunk", "course:splunk"],
  ["splunk-2026", "course:splunk"],
  ["stock-options", "course:stock-options"],
]);
const QUIZ_ID_BY_TITLE = new Map([
  ["T.O Analytics Power User Exam Quiz", "power-user"],
  ["T.O Analytics Splunk Admin Exam Quiz", "admin"],
  ["T.O Analytics –- SPLK-2002 Practice Quiz", "splk-2002"],
]);

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeResourceId(value) {
  return String(value || "").trim().toLowerCase();
}

function quizIdForTitle(value) {
  return QUIZ_ID_BY_TITLE.get(String(value || "").trim()) || null;
}

function resourceIdsFor(record) {
  return [...new Set((record?.resourceIds || []).map(normalizeResourceId).filter((id) => RESOURCE_IDS.has(id)))];
}

function accessResponse(resourceIds) {
  const ids = [...new Set(resourceIds.map(normalizeResourceId).filter((id) => RESOURCE_IDS.has(id)))];
  return {
    resourceIds: ids,
    courseIds: ids.filter((id) => id.startsWith("course:")).map((id) => id.slice("course:".length)),
    quizIds: ids.filter((id) => id.startsWith("quiz:")).map((id) => id.slice("quiz:".length)),
  };
}

async function getMyAccess(emailValue) {
  const email = normalizeEmail(emailValue);
  const record = await StudentAccess.findOne({ email }).select("resourceIds").lean();
  return accessResponse(resourceIdsFor(record));
}

async function checkCourseAccess(emailValue, courseIdValue) {
  const requestedId = String(courseIdValue || "").trim().toLowerCase();
  const resourceId = COURSE_ID_ALIASES.get(requestedId);
  if (!resourceId) return null;

  const access = await getMyAccess(emailValue);
  if (!access.resourceIds.includes(resourceId)) return null;
  return {
    courseId: requestedId,
    cohortId: resourceId === "course:splunk" ? "splunk-2026-oct" : null,
    expiresAt: null,
  };
}

async function checkQuizAccess(emailValue, quizIdValue) {
  const quizId = String(quizIdValue || "").trim().toLowerCase();
  if (!RESOURCE_BY_ID.has(`quiz:${quizId}`)) return null;
  const access = await getMyAccess(emailValue);
  return access.quizIds.includes(quizId) ? { quizId, expiresAt: null } : null;
}

async function listAdminAccess() {
  const [users, assignments] = await Promise.all([
    User.find({}, "name email provider createdAt").sort({ createdAt: -1 }).lean(),
    StudentAccess.find({}, "email fullName resourceIds createdAt").sort({ updatedAt: -1 }).lean(),
  ]);

  const assignmentByEmail = new Map(assignments.map((assignment) => [
    normalizeEmail(assignment.email),
    assignment,
  ]));
  const listedEmails = new Set();
  const students = users.map((student) => {
    const email = normalizeEmail(student.email);
    listedEmails.add(email);
    const assignment = assignmentByEmail.get(email);
    return {
      id: String(student._id),
      name: student.name || assignment?.fullName || email,
      email,
      provider: student.provider || "student account",
      createdAt: student.createdAt || assignment?.createdAt || null,
      resourceIds: resourceIdsFor(assignment),
    };
  });

  for (const assignment of assignments) {
    const email = normalizeEmail(assignment.email);
    if (!email || listedEmails.has(email)) continue;
    students.push({
      id: String(assignment._id),
      name: assignment.fullName || email,
      email,
      provider: "pre-registration assignment",
      createdAt: assignment.createdAt || null,
      resourceIds: resourceIdsFor(assignment),
    });
  }

  return {
    resources: RESOURCES.map(({ id, type, title }) => ({ id, type, title })),
    students,
  };
}

async function saveStudentAccess(emailValue, resourceIdValues) {
  const email = normalizeEmail(emailValue);
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    const error = new Error("Enter a valid student email address.");
    error.statusCode = 400;
    throw error;
  }

  if (!Array.isArray(resourceIdValues)) {
    const error = new Error("The selected courses and quizzes are invalid.");
    error.statusCode = 400;
    throw error;
  }
  const resourceIds = [...new Set(resourceIdValues.map(normalizeResourceId))];
  if (resourceIds.some((id) => !RESOURCE_IDS.has(id))) {
    const error = new Error("One of the selected courses or quizzes is invalid.");
    error.statusCode = 400;
    throw error;
  }

  const [student, existing] = await Promise.all([
    User.findOne({ email }).select("name").lean(),
    StudentAccess.findOne({ email }).select("fullName").lean(),
  ]);
  await StudentAccess.findOneAndUpdate(
    { email },
    {
      $set: {
        email,
        fullName: student?.name || existing?.fullName || email,
        resourceIds,
      },
    },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
  );

  return getMyAccess(email);
}

module.exports = {
  RESOURCES,
  quizIdForTitle,
  normalizeEmail,
  checkCourseAccess,
  checkQuizAccess,
  getMyAccess,
  listAdminAccess,
  saveStudentAccess,
};
