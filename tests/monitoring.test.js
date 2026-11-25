const { test } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { fixture, payload, register } = require('./helpers/monitoringFixture');

test('authenticated project/key/trace/status workflow with isolated storage adapter', async t => {
  const f = await fixture(); t.after(f.close);
  const { project, secret, key } = await register(f);
  assert.equal(project.name, 'Shopping API');
  assert.match(secret, /^to_live_/);
  assert.notEqual(f.supabase.rows.monitoring_project_keys[0].key_hash, secret);
  const before = await (await f.request(`/api/monitoring/projects/${project.id}/status`)).json();
  assert.equal(before.connected, false);
  assert.equal((await (await f.request('/api/monitoring/projects')).json()).projects[0].id, project.id);
  const body = payload();
  const send = () => f.request('/otlp/v1/traces', { user: null, method: 'POST', body, headers: { 'x-to-project-key': secret } });
  assert.equal((await send()).status, 200);
  assert.equal((await send()).headers.get('x-to-stored-spans'), '0');
  const after = await (await f.request(`/api/monitoring/projects/${project.id}/status`)).json();
  assert.equal(after.connected, true);
  assert.equal(after.span_count, 1);
  const spans = await (await f.request(`/api/monitoring/projects/${project.id}/spans`)).json();
  assert.equal(spans.spans[0].http_route, '/products');
  assert.ok(!JSON.stringify(spans).includes('SENSITIVE_NOT_STORED'));
  const listed = await (await f.request(`/api/monitoring/projects/${project.id}/keys`)).json();
  assert.ok(!JSON.stringify(listed).includes(secret));
  assert.ok(!JSON.stringify(listed).includes('key_hash'));
  assert.equal((await f.request(`/api/monitoring/projects/${project.id}/keys/${key.id}`, { method: 'DELETE' })).status, 204);
  assert.equal((await send()).status, 401);
});

test('rejects anonymous, forged, expired and cross-owner reads/writes', async t => {
  const f = await fixture(); t.after(f.close);
  const { project, secret, key } = await register(f);
  assert.equal((await f.request('/api/monitoring/projects', { user: null })).status, 401);
  assert.equal((await f.request('/api/monitoring/projects', { headers: { Authorization: 'Bearer forged' } })).status, 401);
  const expired = jwt.sign({ userId: 'owner-a' }, process.env.JWT_SECRET, { expiresIn: -10 });
  assert.equal((await f.request('/api/monitoring/projects', { headers: { Authorization: `Bearer ${expired}` } })).status, 401);
  assert.equal((await f.request('/api/monitoring/projects', { headers: { Authorization: `Bearer ${secret}` } })).status, 401);
  assert.deepEqual((await (await f.request('/api/monitoring/projects', { user: 'owner-b' })).json()).projects, []);
  for (const suffix of ['status', 'spans', 'keys']) assert.equal((await f.request(`/api/monitoring/projects/${project.id}/${suffix}`, { user: 'owner-b' })).status, 404);
  assert.equal((await f.request(`/api/monitoring/projects/${project.id}/keys`, { user: 'owner-b', method: 'POST' })).status, 404);
  assert.equal((await f.request(`/api/monitoring/projects/${project.id}/keys/${key.id}`, { user: 'owner-b', method: 'DELETE' })).status, 404);
});

test('existing cookie sessions require CSRF and enforce trusted origins', async t => {
  const f = await fixture(); t.after(f.close);
  const csrf = 'x'.repeat(43);
  const options = { user: null, method: 'POST', body: { name: 'Shopping API', runtime: 'nodejs', environment: 'development' }, headers: { Cookie: `to_session=${f.token('cookie-owner')}; to_csrf=${csrf}`, Origin: 'http://localhost:5173' } };
  assert.equal((await f.request('/api/monitoring/projects', options)).status, 403);
  options.headers['X-CSRF-Token'] = csrf;
  assert.equal((await f.request('/api/monitoring/projects', options)).status, 201);
  options.headers.Origin = 'https://untrusted.invalid';
  assert.equal((await f.request('/api/monitoring/projects', options)).status, 403);
});

test('rejects malformed, oversized and unsupported telemetry; enforces quota', async t => {
  const f = await fixture(); t.after(f.close);
  const { secret, project } = await register(f);
  const send = body => f.request('/otlp/v1/traces', { user: null, method: 'POST', body, headers: { 'x-to-project-key': secret } });
  assert.equal((await f.request('/otlp/v1/traces', { method: 'POST', body: payload() })).status, 401);
  assert.equal((await send({})).status, 400);
  assert.equal((await send({ resourceSpans: [null] })).status, 400);
  const large = payload(); large.resourceSpans[0].scopeSpans[0].spans = Array.from({ length: 101 }, () => large.resourceSpans[0].scopeSpans[0].spans[0]);
  assert.equal((await send(large)).status, 413);
  assert.equal((await send({ huge: 'x'.repeat(270000) })).status, 413);
  assert.equal((await fetch(f.root + '/otlp/v1/traces', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-to-project-key': secret }, body: '{bad' })).status, 400);
  assert.equal((await fetch(f.root + '/otlp/v1/traces', { method: 'POST', headers: { 'Content-Type': 'application/x-protobuf', 'x-to-project-key': secret }, body: 'binary' })).status, 415);
  assert.equal((await f.request('/otlp/v1/logs', { method: 'POST' })).status, 501);
  f.supabase.quotaExceeded = true;
  const limited = await send(payload());
  assert.equal(limited.status, 429); assert.equal(limited.headers.get('retry-after'), '60');
  assert.equal((await (await f.request(`/api/monitoring/projects/${project.id}/status`)).json()).connected, false);
});

test('key cap, invalid identifiers, stale status and safe storage errors', async t => {
  const f = await fixture(); t.after(f.close);
  const { project } = await register(f);
  const path = `/api/monitoring/projects/${project.id}`;
  for (const body of [{ name: 'Shopping API', runtime: 'nodejs' }, { name: 'Shopping API', runtime: 'nodejs', environment: 'development', owner_user_id: 'forged' }]) {
    assert.equal((await f.request('/api/monitoring/projects', { method: 'POST', body })).status, 400);
  }
  for (let i = 0; i < 2; i++) assert.equal((await f.request(path + '/keys', { method: 'POST' })).status, 201);
  assert.equal((await f.request(path + '/keys', { method: 'POST' })).status, 409);
  assert.equal((await f.request('/api/monitoring/projects/invalid/status')).status, 400);
  assert.equal((await f.request(path + '/spans?limit=101')).status, 400);
  f.supabase.rows.monitoring_projects[0].last_received_at = new Date(Date.now() - 11 * 60_000).toISOString();
  const status = await (await f.request(path + '/status')).json();
  assert.equal(status.connected, false); assert.equal(status.has_received, true);
  f.supabase.unavailable = true;
  const unavailable = await f.request('/api/monitoring/projects');
  assert.equal(unavailable.status, 503); assert.ok(!(await unavailable.text()).includes('PRIVATE DATABASE DETAIL'));
});

test('ingestion enforces the 120-request IP limit even for invalid keys', async t => {
  const f = await fixture(); t.after(f.close);
  const statuses = await Promise.all(Array.from({length:120},async()=>
    (await f.request('/otlp/v1/traces',{user:null,method:'POST',body:{resourceSpans:[]}})).status));
  assert.ok(statuses.every(status=>status===401));
  const limited=await f.request('/otlp/v1/traces',{user:null,method:'POST',body:{resourceSpans:[]}});
  assert.equal(limited.status,429);
  assert.ok(Number(limited.headers.get('retry-after'))>0);
  assert.equal(f.supabase.rows.monitoring_spans.length,0);
});
