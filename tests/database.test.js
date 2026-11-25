const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function setup(connect, readyState = 0, configured = true) {
  const mongoose = { connection: { readyState }, connect };
  const sandbox = { module: { exports: {} }, require: () => mongoose,
    process: { env: configured ? { DATABASE_URL: 'mongodb://test-only/accounts' } : {} },
    Date, Promise, setTimeout, clearTimeout };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../services/database.js'), 'utf8'), sandbox);
  return sandbox.module.exports;
}

test('concurrent authentication requests share one connection attempt', async () => {
  let finish, calls = 0;
  const service = setup(() => { calls++; return new Promise(resolve => { finish = resolve; }); });
  const first = service.connectDatabase();
  const second = service.connectDatabase();
  assert.equal(first, second);
  assert.equal(calls, 1);
  finish();
  await first;
});

test('connected database allows authentication immediately', async () => {
  const service = setup(() => assert.fail('Already connected'), 1);
  let continued = false;
  await service.requireDatabase({}, {}, () => { continued = true; });
  assert.equal(continued, true);
});

test('database failure returns 503 without exposing connection details or running authentication', async () => {
  const service = setup(() => Promise.reject(new Error('private connection details')));
  const headers = {};
  const res = { set(key, value) { headers[key] = value; }, status(code) { this.code = code; return this; }, json(body) { this.body = body; } };
  await service.requireDatabase({}, res, () => assert.fail('Must not query users'));
  assert.equal(res.code, 503);
  assert.equal(headers['Retry-After'], '5');
  assert.doesNotMatch(res.body.message, /private/);
});

test('missing configuration fails explicitly before calling MongoDB', async () => {
  const service = setup(() => assert.fail('No URL'), 0, false);
  await assert.rejects(service.connectDatabase(), /DATABASE_URL/);
});
