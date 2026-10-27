"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const crypto = require("node:crypto");

// Load isolated pure-data/rubric functions without DB/network packages.
function isolatedRequire(relativePath) {
  const original = Module._load;
  const fakeRouter = { use() {}, get() {}, post() {} };
  Module._load = function(request, parent, isMain) {
    if (request === "express") return { Router: () => fakeRouter };
    if (request.includes("config/supabaseAdmin.js")) return {};
    if (request.includes("middleware/skillLabAuth.js")) return { requireSkillLabAuth: (_req, _res, next) => next() };
    return original.call(this, request, parent, isMain);
  };
  try { return require(relativePath); }
  finally { Module._load = original; }
}

const { BANK, TASKS } = isolatedRequire("../scripts/seedSkillLabV2.js");
const { evaluateTask } = isolatedRequire("../routes/skillLabWorkplace.js");

test("each supported role has at least 20 distinct interview questions", () => {
  for (const role of ["analyst", "soc", "engineer"]) {
    assert.equal(BANK[role].length, 20);
    const prompts = new Set(BANK[role].map(([prompt]) => prompt));
    assert.equal(prompts.size, 20);
    for (const [prompt, options, correct] of BANK[role]) {
      assert.ok(prompt.length >= 20);
      assert.equal(options.length, 4);
      assert.ok(Number.isInteger(correct) && correct >= 0 && correct < 4);
    }
  }
});

test("seed rotates correct answers so choices are not all A", () => {
  const choices = BANK.analyst.map(([prompt, options, answer]) => {
    const offset = crypto.createHash("sha256").update(prompt).digest()[0] % options.length;
    return (answer - offset + options.length) % options.length;
  });
  assert.ok(new Set(choices).size >= 3);
});

test("each role has several distinct evidence-based tasks", () => {
  for (const role of ["analyst", "soc", "engineer"]) {
    assert.equal(TASKS[role].length, 6);
    assert.equal(new Set(TASKS[role].map((task) => task[0])).size, 6);
    for (const t of TASKS[role]) {
      assert.ok(Array.isArray(t[3]) && t[3].length);
      assert.ok(t[6].length > 0 && t[7].length > 0);
    }
  }
});

test("task rubric passes evidence-rich submissions, flags weak work", () => {
  const rubric = { rubric: { spl_terms: ["stats", "src_ip", "by"], report_terms: ["login", "investigate"] } };
  const good = evaluateTask(rubric, "index=training | stats count by src_ip", "This login pattern needs attention. Investigate timestamps, source network and affected users, then verify signs of unauthorized access and escalate based on additional evidence.");
  assert.equal(good.status, "completed");
  assert.equal(good.score, 100);
  const weak = evaluateTask(rubric, "index=training", "Done");
  assert.equal(weak.status, "needs_revision");
  assert.ok(weak.score < 70);
});
