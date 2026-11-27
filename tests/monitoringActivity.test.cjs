'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fixture, payload, register } = require('./helpers/monitoringFixture');

test('database and outbound HTTP activity cannot refresh HTTP server connection or Overview counts', async t => {
  const f = await fixture({ advancedTraces: true }); t.after(f.close);
  const { project, secret } = await register(f);
  const status = async () => (await f.request(`/api/monitoring/projects/${project.id}/status`)).json();
  const send = body => f.request('/otlp/v1/traces', { user: null, method: 'POST', body, headers: { 'x-to-project-key': secret } });
  const database = payload();
  const db = database.resourceSpans[0].scopeSpans[0].spans[0];
  db.kind = 3; db.attributes = [{ key: 'db.system', value: { stringValue: 'mysql' } }];
  assert.equal((await send(database)).headers.get('x-to-stored-spans'), '1');
  let result = await status();
  assert.equal(result.connected, false); assert.equal(result.has_received, false);
  assert.equal(result.last_seen_at, null); assert.equal(result.span_count, 0);
  assert.equal(result.database_active, true); assert.equal(result.availability, 'unknown');
  assert.ok(result.telemetry_last_seen_at);

  const old = new Date(Date.now() - 20 * 60_000).toISOString();
  f.supabase.rows.monitoring_spans.push({ project_id: project.id, span_kind: 'SERVER', http_method: 'GET', received_at: old });
  // Foreign HTTP activity and outbound HTTP activity must not count as serving.
  f.supabase.rows.monitoring_spans.push({ project_id: 'other-project', span_kind: 'SERVER', http_method: 'GET', received_at: new Date().toISOString() });
  const outbound = payload(); outbound.resourceSpans[0].scopeSpans[0].spans[0].kind = 3;
  await send(outbound);
  result = await status();
  assert.equal(result.connected, false); assert.equal(result.last_seen_at, old);
  assert.equal(result.has_received, true); assert.equal(result.span_count, 1);
  assert.equal((await (await f.request(`/api/monitoring/projects/${project.id}/spans`)).json()).spans.length, 1);

  assert.equal((await send(payload())).status, 200);
  result = await status(); assert.equal(result.connected, true); assert.equal(result.http_active, true);
  assert.equal(result.span_count, 2); assert.equal(result.database_active, true);
  // Duplicate, empty and quota rejected batches must not manufacture receipt.
  const receipt = result.last_seen_at;
  await send({ resourceSpans: [] }); await send(database);
  f.supabase.quotaExceeded = true;
  const rejected = await send(payload()); assert.equal(rejected.status, 429);
  assert.equal(rejected.headers.get('retry-after'), '60');
  assert.equal((await status()).last_seen_at, receipt);
  assert.equal((await f.request(`/api/monitoring/projects/${project.id}/status`, { user: 'other-owner' })).status, 404);
});

test('receipt timestamp selection is ordered and future timestamps do not establish connection', async t => {
  const f = await fixture({ advancedTraces: true }); t.after(f.close);
  const { project } = await register(f);
  const old = new Date(Date.now() - 20 * 60_000).toISOString();
  const recent = new Date(Date.now() - 1000).toISOString();
  const rows = f.supabase.rows.monitoring_spans;
  for (const received_at of [old, recent, old]) rows.push({ project_id: project.id, span_kind: 'SERVER', http_method: 'GET', received_at });
  const read = async () => (await f.request(`/api/monitoring/projects/${project.id}/status`)).json();
  assert.equal((await read()).last_seen_at, recent);
  rows.length = 0;
  rows.push({ project_id: project.id, span_kind: 'SERVER', http_method: 'GET', received_at: new Date(Date.now() + 60000).toISOString() });
  assert.equal((await read()).connected, false);
});

test('Express INTERNAL parent is filtered without rewriting related MySQL context; malformed mixed batch stores nothing', async t => {
  const f = await fixture({ advancedTraces: true }); t.after(f.close);
  const { project, secret } = await register(f);
  const body = payload(), spans = body.resourceSpans[0].scopeSpans[0].spans;
  const server = spans[0];
  const internal = { ...server, kind: 1, parentSpanId: server.spanId, spanId: '123456789abcdef0' };
  const client = { ...server, kind: 3, parentSpanId: internal.spanId, spanId: '123456789abcdef1',
    attributes: [{ key: 'db.system.name', value: { stringValue: 'mysql' } }] };
  spans.push(internal, client);
  const send = data => f.request('/otlp/v1/traces', { user: null, method: 'POST', body: data, headers: { 'x-to-project-key': secret } });
  const malformed = structuredClone(body);
  malformed.resourceSpans[0].scopeSpans[0].spans[2].traceId = 'invalid';
  assert.equal((await send(malformed)).status, 400);
  assert.equal(f.supabase.rows.monitoring_spans.length, 0);
  assert.equal((await send(body)).headers.get('x-to-stored-spans'), '2');
  const read = await f.request(`/api/monitoring/projects/${project.id}/spans?trace_id=${server.traceId}`);
  const rows = (await read.json()).spans;
  assert.equal(rows.length, 2);
  assert.ok(rows.every(row => row.trace_id === server.traceId));
  assert.equal(rows.find(row => row.span_kind === 'CLIENT').parent_span_id, internal.spanId);
  assert.ok(!rows.some(row => row.span_id === internal.spanId));
});
