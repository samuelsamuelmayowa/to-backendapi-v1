'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { createRequire } = require('node:module');
const { fixture, register } = require('./helpers/monitoringFixture');

test('staged MAFACONNECT patch reports bind failure instead of false readiness', async () => {
  const patch = fs.readFileSync(path.join(__dirname, '../patches/mafaconnect-listen-error.patch'), 'utf8');
  const lines = patch.split('\n').filter(line => !/^(---|\+\+\+|@@)/.test(line));
  const before = lines.filter(line => line.startsWith('-')).map(line => line.slice(1)).join('\n');
  const after = lines.filter(line => line.startsWith('+')).map(line => line.slice(1)).join('\n');
  // The callback below is the existing application callback. Optionally verify
  // the patch against the real source, read-only; never load its entry point.
  let source = '    app.listen(PORT, () => {\n      console.log(`Server running on port ${PORT}`);\n    });';
  if (process.env.MONITORING_TEST_APPLICATION_DIR) {
    const actual = fs.readFileSync(path.join(process.env.MONITORING_TEST_APPLICATION_DIR, 'app.js'), 'utf8').replaceAll('\r\n', '\n');
    source = actual.match(/    app\.listen\(PORT, \(\) => \{[\s\S]*?\n    \}\);/)[0];
  }
  assert.ok(source.includes(before), 'Patch must match the actual startup callback');
  function run(code, error) {
    const logs = [], errors = [];
    vm.runInNewContext(code, { PORT: 8000, app: { listen(port, callback) { callback(error); } },
      console: { log: (...args) => logs.push(args), error: (...args) => errors.push(args) } });
    return { logs, errors };
  }
  const conflict = Object.assign(new Error('private details'), { code: 'EADDRINUSE' });
  assert.equal(run(source, conflict).logs.length, 1, 'Original code falsely claims readiness');
  const patched = source.replace(before, after);
  const failed = run(patched, conflict);
  assert.equal(failed.logs.length, 0);
  assert.deepEqual(failed.errors, [['Server failed to listen:', 'EADDRINUSE']]);
  assert.equal(run(patched).logs.length, 1);
});

test('occupied port stores startup MySQL but generates no HTTP SERVER spans', {
  skip: !process.env.MONITORING_TEST_APPLICATION_DIR && 'Set MONITORING_TEST_APPLICATION_DIR to inspect installed Express 5/OTel/mysql2 without loading app.js', timeout: 45000,
}, async t => {
  const appRequire = createRequire(path.join(process.env.MONITORING_TEST_APPLICATION_DIR, 'package.json'));
  const expressPath = appRequire.resolve('express');
  assert.equal(appRequire('express/package.json').version.split('.')[0], '5');
  const receipts = [], exported = [];
  const f = await fixture({ advancedTraces: true, onExport(body, status, stored) {
    receipts.push({ status, stored });
    for (const resource of body.resourceSpans || []) for (const scope of resource.scopeSpans || [])
      for (const span of scope.spans || []) exported.push(span.kind);
  } });
  t.after(f.close);
  const { project, secret } = await register(f);
  let served = 0;
  const blocker = http.createServer((req, res) => { served++; res.end('existing uninstrumented listener'); });
  await new Promise(resolve => blocker.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { blocker.close(resolve); blocker.closeAllConnections(); }));
  const env = {};
  for (const name of ['PATH','Path','SystemRoot','COMSPEC','PATHEXT','WINDIR','TEMP','TMP','USERPROFILE','APPDATA','LOCALAPPDATA'])
    if (process.env[name]) env[name] = process.env[name];
  Object.assign(env, {
    MONITORING_TEST_EXPRESS_PATH: expressPath, MONITORING_TEST_MYSQL_PATH: appRequire.resolve('mysql2'),
    MONITORING_TEST_MYSQL_SUCCESS: '1', MONITORING_TEST_PORT: String(blocker.address().port),
    OTEL_SERVICE_NAME: 'isolated-port-conflict', OTEL_TRACES_EXPORTER: 'otlp',
    OTEL_EXPORTER_OTLP_TRACES_PROTOCOL: 'http/json', OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: f.root + '/otlp/v1/traces',
    OTEL_EXPORTER_OTLP_TRACES_HEADERS: 'x-to-project-key=' + secret,
    OTEL_NODE_ENABLED_INSTRUMENTATIONS: 'http,express,mysql2', OTEL_NODE_RESOURCE_DETECTORS: 'env',
    OTEL_METRICS_EXPORTER: 'none', OTEL_LOGS_EXPORTER: 'none', OTEL_BSP_SCHEDULE_DELAY: '100',
    OTEL_BSP_MAX_EXPORT_BATCH_SIZE: '100', OTEL_BSP_MAX_QUEUE_SIZE: '1000',
  });
  const child = spawn(process.execPath, ['--require', appRequire.resolve('@opentelemetry/auto-instrumentations-node/register'),
    path.join(__dirname, '../tools/monitoring-node-probe-app.cjs')], { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(async () => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const exited = new Promise(resolve => child.once('exit', resolve));
    child.kill(); await exited;
  });
  child.stderr.resume();
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Bind failure not reported')), 15000);
    let output = '';
    child.stdout.on('data', chunk => {
      output += chunk;
      if (output.includes('Probe bind error=EADDRINUSE')) { clearTimeout(timer); resolve(); }
    });
    child.once('error', () => { clearTimeout(timer); reject(new Error('Probe failed to spawn')); });
    child.once('exit', () => { clearTimeout(timer); reject(new Error('Probe exited before reporting bind failure')); });
  });
  await (await fetch(`http://127.0.0.1:${blocker.address().port}/`)).arrayBuffer();
  assert.equal(served, 1, 'Request reaches the old listener');
  const deadline = Date.now() + 10000;
  while (!f.supabase.rows.monitoring_spans.length && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 100));
  await new Promise(resolve => setTimeout(resolve, 500));
  const rows = f.supabase.rows.monitoring_spans;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].db_system, 'mysql'); assert.equal(rows[0].span_kind, 'CLIENT');
  assert.equal(rows[0].parent_span_id, null);
  assert.ok(exported.includes(3)); assert.ok(!exported.includes(2));
  assert.ok(receipts.length); assert.ok(receipts.every(r => r.status === 200));
  assert.equal(receipts.reduce((n, r) => n + r.stored, 0), 1);
  const status = await (await f.request(`/api/monitoring/projects/${project.id}/status`)).json();
  assert.equal(status.connected, false); assert.equal(status.database_active, true);
});
