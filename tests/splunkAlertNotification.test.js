const test = require("node:test");
const assert = require("node:assert/strict");
const { validateSimulatedNotification, makeEmail } = require("../services/splunkAlertNotification.js");
const base = { alertName: "Bad logins", spl: "index=training_security action=failure", operator: ">=", metric: "events", observed: 15, threshold: 10, triggered: true };
test("accepts a triggered simulation for the student's own account", () => {
  assert.equal(validateSimulatedNotification(base).observed, 15);
});
test("rejects client claiming trigger contrary to count", () => {
  assert.throws(() => validateSimulatedNotification({ ...base, observed: 2 }), /Only triggered/);
});
test("rejects requests without true triggered marker", () => {
  assert.throws(() => validateSimulatedNotification({ ...base, triggered: false }), /Only triggered/);
});
test("rejects malformed counts, excessive queries and unsupported operators", () => {
  for (const patch of [{ observed: NaN }, { threshold: -1 }, { threshold: 1.5 }, { operator: "bad" }, { spl: "x".repeat(4001) }, { metric: "bogus" }]) {
    assert.throws(() => validateSimulatedNotification({ ...base, ...patch }));
  }
});
test("email HTML escapes student-provided SPL and alert titles", () => {
  const body = makeEmail({ ...base, alertName: "<img src=x>", spl: "<script>alert(1)</script>" });
  assert.ok(body.html.includes("&lt;img src=x&gt;"));
  assert.ok(!body.html.includes("<script>"));
  assert.ok(body.html.includes("training simulation") || body.html.includes("simulation"));
});
