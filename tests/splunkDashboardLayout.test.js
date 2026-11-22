"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const Dashboard = require("../model/SplunkStudentDashboard");
const { createDashboard, updateDashboard } = require("../controller/splunkStudent");

const ownerId = "507f1f77bcf86cd799439011";
const id = "507f1f77bcf86cd799439012";
const position = { x: 120, y: 80, width: 600, height: 280 };
const panel = { id: "p1", title: "Sign-ins", type: "number", spl: "index=toa_soc | stats count", position };
const makeResponse = () => ({
  statusCode: 200,
  status(code) { this.statusCode = code; return this; },
  json(value) { this.body = value; },
});
const request = (body) => ({ body, params: { id }, splunkStudent: { ownerId } });
const fail = (error) => { throw error; };

test("save and update preserve panel position and scope changes to the student", async (t) => {
  t.mock.method(Dashboard, "create", async (value) => new Dashboard({ ...value, _id: id }));
  t.mock.method(Dashboard, "findOneAndUpdate", async (filter, update) => {
    assert.deepEqual(filter, { _id: id, ownerId });
    return new Dashboard({ ...update.$set, _id: id, ownerId });
  });
  const panels = [panel, ...["line", "pie"].map((type) => ({ ...panel, id: type, type }))];
  for (const [method, layout] of [[createDashboard, "absolute"], [updateDashboard, "grid"]]) {
    const res = makeResponse();
    await method(request({ name: "SOC", layout, panels }), res, fail);
    assert.equal(res.body.data.layout, layout);
    assert.deepEqual(res.body.data.panels.map(({ type }) => type), ["number", "line", "pie"]);
    assert.deepEqual(res.body.data.panels[0].position, position);
  }
});

test("legacy requests default to Grid and out-of-bounds geometry is rejected", async (t) => {
  const write = t.mock.method(Dashboard, "create", async (value) => new Dashboard(value));
  const legacy = makeResponse();
  await createDashboard(request({ name: "Legacy", panels: [{ ...panel, position: undefined }] }), legacy, fail);
  assert.equal(legacy.body.data.layout, "grid");
  const invalid = makeResponse();
  await createDashboard(request({ name: "SOC", layout: "absolute", panels: [{ ...panel, position: { ...position, x: 800 } }] }), invalid, fail);
  assert.equal(invalid.statusCode, 400);
  assert.equal(write.mock.callCount(), 1);
});
