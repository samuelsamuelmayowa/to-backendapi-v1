"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { missionsForIndexes } = require("../controller/splunkStudent");

test("guided missions select original T.O. indexes when the synthetic catalog is hosted", () => {
  const progress = new Map([["buttercup-explorer", { completed: true, bestScore: 100 }]]);
  const missions = missionsForIndexes(["toa_web", "toa_auth", "toa_sales", "toa_prices"], progress);
  assert.match(missions[0].starterSPL, /^index=toa_web\b/);
  assert.match(missions[1].starterSPL, /^index=toa_auth\b/);
  assert.match(missions[2].starterSPL, /^index=toa_web\b/);
  assert.equal(missions[0].progress.bestScore, 100);
  assert.ok(missions.every((mission) => !/Buttercup/i.test(`${mission.title} ${mission.scenario}`)));
});

test("guided missions retain Buttercup SPL starters when that catalog is present", () => {
  const missions = missionsForIndexes(["buttercup_web", "buttercup_auth"]);
  assert.match(missions[0].starterSPL, /^index=buttercup_web\b/);
  assert.match(missions[1].starterSPL, /^index=buttercup_auth\b/);
});
