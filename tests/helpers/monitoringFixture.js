'use strict';
const { randomUUID } = require('node:crypto');
const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const { csrfProtection } = require('../../middleware/sessionCookie');
const { createMonitoringRoutes, monitoringError } = require('../../routes/monitoring');

// Deliberately in-memory. This exercises HTTP/auth/serialization, NOT PostgreSQL
// transactions or RLS. Live Supabase migration verification remains a separate gate.
function fakeSupabase() {
  const rows = { monitoring_projects: [], monitoring_project_keys: [], monitoring_spans: [] };
  const client = { rows, quotaExceeded: false, unavailable: false, rpcCalls: [],
    from(table) {
      const filters = [];
      let fields = '*', mode = 'read', input, single = false, head = false, max = Infinity, sorting;
      const query = {
        select(value = '*', opts = {}) { fields = value; head = opts.head; return this; },
        eq(key, value) { filters.push(row => row[key] === value); return this; },
        is(key, value) { filters.push(row => (row[key] ?? null) === value); return this; },
        not(key, operator, value) { if (operator !== 'is') throw new Error('Unsupported test filter'); filters.push(row => (row[key] ?? null) !== value); return this; },
        order(key, { ascending = true } = {}) { sorting = { key, ascending }; return this; }, limit(value) { max = value; return this; },
        insert(value) { mode = 'insert'; input = value; return this; },
        update(value) { mode = 'update'; input = value; return this; },
        single() { single = true; return this; }, maybeSingle() { single = true; return this; },
        then(resolve, reject) {
          return Promise.resolve().then(() => {
            if (client.unavailable) return { data: null, error: { code: 'PGRST205', message: 'PRIVATE DATABASE DETAIL' } };
            if (mode === 'insert') rows[table].push({ id: randomUUID(), created_at: new Date().toISOString(), ...input });
            let result = rows[table].filter(row => filters.every(filter => filter(row)));
            if (mode === 'insert') result = [rows[table].at(-1)];
            if (mode === 'update') result.forEach(row => Object.assign(row, input));
            const count = result.length;
            if (sorting) result.sort((a, b) => (a[sorting.key] < b[sorting.key] ? -1 : a[sorting.key] > b[sorting.key] ? 1 : 0) * (sorting.ascending ? 1 : -1));
            result = result.slice(0, max).map(row => fields === '*' ? { ...row } : Object.fromEntries(fields.split(',').map(key => [key, row[key]])));
            return { data: head ? null : single ? result[0] || null : result, count, error: null };
          }).then(resolve, reject);
        },
      };
      return query;
    },
    async rpc(name, args) {
      client.rpcCalls.push(name);
      if (client.unavailable) return { error: { code: 'PGRST202' } };
      if (name === 'monitoring_create_project_key') {
        const project = rows.monitoring_projects.find(row => row.id === args.p_project_id && row.owner_user_id === args.p_owner_user_id);
        if (!project) return { data: { error: 'not_found' } };
        if (rows.monitoring_project_keys.filter(row => row.project_id === project.id && !row.revoked_at).length >= 3) return { data: { error: 'key_limit' } };
        const key = { id: randomUUID(), project_id: project.id, key_hash: args.p_key_hash, key_prefix: args.p_key_prefix, created_at: new Date().toISOString() };
        rows.monitoring_project_keys.push(key);
        return { data: { id: key.id, key_prefix: key.key_prefix, created_at: key.created_at } };
      }
      if (name === 'monitoring_ingest_spans' || name === 'monitoring_ingest_spans_v2') {
        const key = rows.monitoring_project_keys.find(row => row.key_hash === args.p_key_hash && !row.revoked_at);
        if (!key) return { data: { error: 'invalid_key' } };
        if (client.quotaExceeded) return { data: { error: 'quota_exceeded' } };
        const fresh = args.p_spans.filter(span => !rows.monitoring_spans.some(row => row.project_id === key.project_id && row.trace_id === span.trace_id && row.span_id === span.span_id));
        fresh.forEach(span => rows.monitoring_spans.push({ span_kind: 'SERVER', ...span, id: randomUUID(), project_id: key.project_id, received_at: new Date().toISOString() }));
        if (fresh.length) rows.monitoring_projects.find(row => row.id === key.project_id).last_received_at = new Date().toISOString();
        return { data: { stored: fresh.length } };
      }
      return { data: {} };
    },
  };
  return client;
}

async function fixture(options = {}) {
  process.env.JWT_SECRET = 'monitoring-test-only-secret';
  process.env.MONITORING_PUBLIC_OTLP_TRACES_URL = 'http://127.0.0.1:8000/otlp/v1/traces';
  const supabase = fakeSupabase();
  const app = express();
  const routes = createMonitoringRoutes({ getSupabase: () => supabase, ...options });
  app.use('/otlp', routes.ingestion);
  app.use('/api/monitoring', express.json({ limit: '16kb' }), monitoringError);
  app.use(express.json(), cookieParser(), csrfProtection);
  app.use('/api/monitoring', routes.management);
  const server = await new Promise(resolve => { const result = app.listen(0, '127.0.0.1', () => resolve(result)); });
  const root = `http://127.0.0.1:${server.address().port}`;
  const token = userId => jwt.sign({ userId, email: 'test@example.invalid' }, process.env.JWT_SECRET, { expiresIn: '5m' });
  async function request(path, { user = 'owner-a', method = 'GET', body, headers = {} } = {}) {
    return fetch(root + path, { method, headers: { ...(user ? { Authorization: `Bearer ${token(user)}` } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  }
  return { root, supabase, request, token, close: () => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }) };
}

function payload() {
  const start = BigInt(Date.now()) * 1_000_000n;
  return { resourceSpans: [{ resource: { attributes: [{ key: 'service.name', value: { stringValue: 'shopping-api' } }] }, scopeSpans: [{ spans: [{
    kind: 2, traceId: randomUUID().replaceAll('-', ''), spanId: randomUUID().replaceAll('-', '').slice(0, 16),
    startTimeUnixNano: String(start), endTimeUnixNano: String(start + 10_000_000n),
    attributes: [{ key: 'http.request.method', value: { stringValue: 'GET' } }, { key: 'http.route', value: { stringValue: '/products' } }, { key: 'http.response.status_code', value: { intValue: 200 } }, { key: 'http.request.header.authorization', value: { stringValue: 'SENSITIVE_NOT_STORED' } }],
  }] }] }] };
}

async function register(f) {
  const response = await f.request('/api/monitoring/projects', { method: 'POST', body: { name: 'Shopping API', runtime: 'nodejs', environment: 'development' } });
  if (response.status !== 201) throw new Error(`Registration failed (${response.status})`);
  const { project } = await response.json();
  const created = await f.request(`/api/monitoring/projects/${project.id}/keys`, { method: 'POST' });
  return { project, ...(await created.json()) };
}
module.exports = { fixture, payload, register, fakeSupabase };
