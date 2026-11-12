"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createSplunkStudentAuth } = require("../middleware/splunkStudentAuth");

function response() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

function userModelFor(user) {
  return {
    lastFilter: null,
    findOne(filter) {
      this.lastFilter = filter;
      return { select() { return this; }, lean: async () => user };
    },
  };
}

test("student auth verifies Firebase ID tokens and resolves a server-owned user id", async () => {
  const UserModel = userModelFor({ _id: "65ab12345678901234567890", email: "student@example.com", name: "Student" });
  let verifiedRevocation = false;
  const middleware = createSplunkStudentAuth({
    admin: { auth: () => ({ verifyIdToken: async (token, checkRevoked) => { assert.equal(token, "firebase-id-token"); verifiedRevocation = checkRevoked; return { uid: "firebase-uid", email: "Student@Example.com", email_verified: true, name: "Student Name" }; } }) },
    UserModel,
  });
  const req = { get: (key) => key === "Authorization" ? "Bearer firebase-id-token" : "" };
  const res = response();
  let nextCalled = false;
  await middleware(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
  assert.equal(verifiedRevocation, true);
  assert.deepEqual(UserModel.lastFilter, { email: "student@example.com" });
  assert.deepEqual(req.splunkStudent, { ownerId: "65ab12345678901234567890", email: "student@example.com", name: "Student" });
});

test("student auth rejects missing, revoked, and unverified identities", async () => {
  const UserModel = userModelFor(null);
  const middleware = createSplunkStudentAuth({
    admin: { auth: () => ({ verifyIdToken: async (token) => {
      if (token === "unverified") return { email: "student@example.com", email_verified: false };
      const error = new Error("revoked token"); error.code = "auth/id-token-revoked"; throw error;
    } }) },
    UserModel,
    verifySession: () => null,
  });
  for (const authorization of ["", "Bearer unverified", "Bearer revoked"]) {
    const req = { get: () => authorization };
    const res = response();
    let nextCalled = false;
    await middleware(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, false);
    assert.ok([401, 403].includes(res.statusCode));
  }
});

test("session identities are resolved through the server user table", async () => {
  const UserModel = userModelFor({ _id: "65ab12345678901234567891", email: "session@example.com", name: "Session Student" });
  const middleware = createSplunkStudentAuth({ UserModel, verifySession: () => ({ claims: { email: "Session@Example.com", userId: "untrusted-claim-is-not-owner" }, source: "cookie" }) });
  const req = { get: () => "" };
  const res = response();
  let nextCalled = false;
  await middleware(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
  assert.deepEqual(UserModel.lastFilter, { email: "session@example.com" });
  assert.equal(req.splunkStudent.ownerId, "65ab12345678901234567891");
});
