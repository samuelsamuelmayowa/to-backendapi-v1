const { test } = require('node:test');
const assert = require('node:assert/strict');
const verify = require('../middleware/verifyGoogleMobile');

async function run(body, identity, reject = false) {
  const req = { body };
  let status, nextCalled = false, checked = false;
  const res = { status(value) { status = value; return this; }, json() { return this; } };
  const admin = { auth: () => ({ verifyIdToken: async (token, revoked) => {
    checked = true;
    assert.equal(token, 'firebase-token');
    assert.equal(revoked, true);
    if (reject) throw new Error('invalid signature');
    return identity;
  } }) };
  await verify(admin)(req, res, () => { nextCalled = true; });
  return { req, status, nextCalled, checked };
}
const identity = { email: 'Student@example.com', name: 'Student', email_verified: true, firebase: { sign_in_provider: 'google.com' } };
test('rejects requests with only a client supplied email', async () => {
  const result = await run({ email: 'victim@example.com' });
  assert.equal(result.status, 401);
  assert.equal(result.checked, false);
  assert.equal(result.nextCalled, false);
});
test('rejects invalid Firebase tokens', async () => {
  const result = await run({ idToken: 'firebase-token' }, null, true);
  assert.equal(result.status, 401);
  assert.equal(result.nextCalled, false);
});
test('rejects unverified email and non-Google sign-in', async () => {
  for (const value of [{ ...identity, email_verified: false }, { ...identity, firebase: { sign_in_provider: 'password' } }]) {
    const result = await run({ idToken: 'firebase-token' }, value);
    assert.equal(result.status, 401);
    assert.equal(result.nextCalled, false);
  }
});
test('takes identity from verified token and ignores spoofed body fields', async () => {
  const result = await run({ idToken: 'firebase-token', email: 'victim@example.com', name: 'Forged' }, identity);
  assert.equal(result.nextCalled, true);
  assert.deepEqual(result.req.googleIdentity, { email: 'student@example.com', name: 'Student' });
});
