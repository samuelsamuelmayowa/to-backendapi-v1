const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

async function attempt(user, password = 'correct-password') {
  let selected, query, compared, cookies = false;
  const mocks = {
    'express-validator': { validationResult: () => ({ isEmpty: () => true }) },
    '../model/user.js': { findOne(value) { query = value; return { select(fields) { selected = fields; return Promise.resolve(user); } }; } },
    jsonwebtoken: { sign: () => 'server-token' },
    bcryptjs: { compare: async (plain, hash) => { compared = { plain, hash }; return plain === 'correct-password'; } },
    '../firebase': {}, nodemailer: {}, '../logger.js': { info() {} },
    '../middleware/sessionCookie': { issueSessionCookies() { cookies = true; return 'csrf'; } },
    dotenv: { config() {} },
  };
  const sandbox = { module: { exports: {} }, require(id) {
    assert.ok(Object.hasOwn(mocks, id), `Unexpected dependency: ${id}`);
    return mocks[id];
  }, process: { env: { JWT_SECRET: 'test-only' } }, console: { log() {}, error() {} } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../controller/authController.js'), 'utf8'), sandbox);
  const result = await new Promise(resolve => {
    const res = { status(code) { this.code = code; return this; }, json(body) { resolve({ code: this.code, body }); } };
    sandbox.module.exports.login({ body: { email: ' Member@Example.com ', password }, ip: '127.0.0.1', get: () => 'http://localhost:5173' }, res,
      error => resolve({ code: error.statusCode, error }));
  });
  return { result, selected, query, compared, cookies };
}

test('password login explicitly loads the hash and returns cookie auth without exposing it', async () => {
  const out = await attempt({ _id: 'user-id', email: 'member@example.com', name: 'Member', password: 'stored-hash' });
  assert.equal(out.selected, '+password');
  assert.equal(out.query.email, 'member@example.com');
  assert.equal(out.compared.hash, 'stored-hash');
  assert.equal(out.result.code, 200);
  assert.equal(out.cookies, true);
  assert.equal(out.result.body.csrfToken, 'csrf');
  assert.equal(out.result.body.token, undefined);
  assert.equal(out.result.body.data.password, undefined);
});
test('missing accounts and Google-only accounts fail without password comparison', async () => {
  for (const user of [null, { email: 'google@example.com' }]) {
    const out = await attempt(user);
    assert.equal(out.result.code, 401);
    assert.equal(out.compared, undefined);
    assert.equal(out.cookies, false);
  }
});
test('wrong passwords never create sessions', async () => {
  const out = await attempt({ password: 'stored-hash' }, 'wrong');
  assert.equal(out.result.code, 403);
  assert.equal(out.cookies, false);
});
test('missing password is rejected before querying accounts', async () => {
  const out = await attempt(null, '');
  assert.equal(out.result.code, 400);
  assert.equal(out.query, undefined);
});
