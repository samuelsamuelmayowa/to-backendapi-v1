const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { fixture, register } = require('./helpers/monitoringFixture');

test('official auto-instrumentation exports real Express HTTP spans as compatible JSON', { timeout: 55000 }, async t => {
  const f = await fixture(); t.after(f.close);
  const { project, secret } = await register(f);
  const example = path.join(__dirname, '../examples/monitoring-node');
  const child = spawn(process.execPath, ['--require', '@opentelemetry/auto-instrumentations-node/register', 'server.cjs'], {
    cwd: example, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: '0',
      OTEL_SERVICE_NAME: 'shopping-api', OTEL_TRACES_EXPORTER: 'otlp',
      OTEL_EXPORTER_OTLP_TRACES_PROTOCOL: 'http/json',
      OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: f.root + '/otlp/v1/traces',
      OTEL_EXPORTER_OTLP_TRACES_HEADERS: `x-to-project-key=${secret}`,
      OTEL_METRICS_EXPORTER: 'none', OTEL_LOGS_EXPORTER: 'none',
      OTEL_NODE_ENABLED_INSTRUMENTATIONS: 'http,express', OTEL_NODE_RESOURCE_DETECTORS: 'env',
      OTEL_BSP_SCHEDULE_DELAY: '100', OTEL_BSP_MAX_EXPORT_BATCH_SIZE: '100', OTEL_BSP_MAX_QUEUE_SIZE: '1000',
    },
  });
  t.after(() => child.kill());
  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Sample application startup timed out')), 30000);
    let output = '';
    child.stdout.on('data', chunk => {
      output += chunk.toString();
      const match = output.match(/127\.0\.0\.1:(\d+)\/products/);
      if (match) { clearTimeout(timer); resolve(Number(match[1])); }
    });
    child.stderr.resume(); // Consume diagnostics without printing secrets or host metadata.
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`Sample exited before readiness (${code})`)); });
  });
  const response = await fetch(`http://127.0.0.1:${port}/products`);
  assert.equal(response.status, 200);
  await response.arrayBuffer();
  let status;
  const deadline = Date.now() + 10000;
  do {
    status = await (await f.request(`/api/monitoring/projects/${project.id}/status`)).json();
    if (status.connected) break;
    await new Promise(resolve => setTimeout(resolve, 150));
  } while (Date.now() < deadline);
  assert.equal(status.connected, true, 'Real auto-instrumented HTTP telemetry must reach storage before connection succeeds');
  const spans = await (await f.request(`/api/monitoring/projects/${project.id}/spans`)).json();
  assert.ok(spans.spans.some(span => span.http_route === '/products' && span.http_method === 'GET' && span.service_name === 'shopping-api'));
  assert.ok(f.supabase.rows.monitoring_spans.every(span => span.project_id === project.id));
});
