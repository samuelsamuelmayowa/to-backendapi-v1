const { test } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { randomUUID, createHash } = require('node:crypto');
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
  f.supabase.rows.monitoring_spans.push({ project_id: project.id, span_kind: 'SERVER', http_method: 'GET', received_at: f.supabase.rows.monitoring_projects[0].last_received_at });
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

test('project totals include all owned registrations, exclude other owners and are not capped by the list limit', async t => {
  const f = await fixture(); t.after(f.close);
  for (let n=0;n<125;n++) f.supabase.rows.monitoring_projects.push({id:randomUUID(),owner_user_id:'owner-a',name:`Application ${n}`,runtime:'nodejs',environment:'development'});
  for (let n=0;n<9;n++) f.supabase.rows.monitoring_projects.push({id:randomUUID(),owner_user_id:'owner-b',name:'Other owner'});
  const response=await f.request('/api/monitoring/projects');
  assert.equal(response.status,200);
  const data=await response.json();
  assert.equal(data.total,125);
  assert.equal(data.projects.length,100);
  assert.ok(data.projects.every(project=>project.name.startsWith('Application')));
});

test('key listing includes older active metadata beyond 50 revoked records, with exact scoped counts',async t=>{
  const f=await fixture();t.after(f.close);
  const id=randomUUID();f.supabase.rows.monitoring_projects.push({id,owner_user_id:'owner-a',name:'MAFACONNECT API'});
  for(let i=0;i<50;i++)f.supabase.rows.monitoring_project_keys.push({id:randomUUID(),project_id:id,key_prefix:'to_live_REVOKED1',key_hash:'PRIVATE_HASH',created_at:'2026-11-25T00:00:00Z',revoked_at:'2026-11-25T01:00:00Z'});
  const active=Array.from({length:3},()=>({id:randomUUID(),project_id:id,key_prefix:'to_live_ACTIVE01',key_hash:'PRIVATE_HASH',created_at:'2026-11-20T00:00:00Z',revoked_at:null}));
  f.supabase.rows.monitoring_project_keys.push(...active);
  const response=await f.request(`/api/monitoring/projects/${id}/keys`);assert.equal(response.status,200);
  const data=await response.json();assert.equal(data.active_count,3);assert.equal(data.max_active_keys,3);
  assert.ok(active.every(key=>data.keys.some(row=>row.id===key.id&&row.created_at===key.created_at)));
  assert.ok(!JSON.stringify(data).includes('PRIVATE_HASH')&&!JSON.stringify(data).includes('key_hash'));
  assert.equal((await f.request(`/api/monitoring/projects/${id}/keys`,{user:'other-owner'})).status,404);
});

test('authenticated empty JSON batch stores zero spans and does not connect a project with an existing key',async t=>{
  const f=await fixture();t.after(f.close);
  const id=randomUUID(),secret='to_live_'+'A'.repeat(43);
  f.supabase.rows.monitoring_projects.push({id,owner_user_id:'owner-a',name:'MAFACONNECT API',last_received_at:null});
  f.supabase.rows.monitoring_project_keys.push({id:randomUUID(),project_id:id,key_prefix:'to_live_AAAAAAAA',key_hash:createHash('sha256').update(secret).digest('hex'),revoked_at:null});
  const sent=await f.request('/otlp/v1/traces',{user:null,method:'POST',body:{resourceSpans:[]},headers:{'x-to-project-key':secret}});
  assert.equal(sent.status,200);assert.equal(sent.headers.get('x-to-stored-spans'),'0');
  const status=await (await f.request(`/api/monitoring/projects/${id}/status`)).json();
  assert.equal(status.connected,false);assert.equal(status.span_count,0);assert.equal(status.has_received,false);assert.equal(status.last_seen_at,null);
  const metadata=await (await f.request(`/api/monitoring/projects/${id}/keys`)).json();assert.equal(metadata.active_count,1);
  assert.ok(!f.supabase.rpcCalls.includes('monitoring_create_project_key'));
});
