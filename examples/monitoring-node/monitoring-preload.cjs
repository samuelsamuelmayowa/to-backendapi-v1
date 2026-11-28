'use strict';
// Load once BEFORE Express/drivers. Never combine with auto-instrumentations-node/register.
const { NodeSDK } = require('@opentelemetry/sdk-node');
const { BatchSpanProcessor } = require('@opentelemetry/sdk-trace');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
const { resourceFromAttributes } = require('@opentelemetry/resources');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const systems = new Set(['mysql', 'postgresql', 'sqlite', 'redis', 'mongodb']);
const operations = new Set(['SELECT','INSERT','UPDATE','DELETE','CREATE','ALTER','DROP','BEGIN','COMMIT','ROLLBACK','GET','SET','DEL','FIND','FINDONE','AGGREGATE','COUNT','PING','EXECUTE']);
const errors = new Set(['Error','TypeError','RangeError','SyntaxError','ReferenceError','TimeoutError','AbortError','ECONNREFUSED','ECONNRESET','ETIMEDOUT','ENOTFOUND','timeout']);
const methods = new Set(['GET','POST','PUT','PATCH','DELETE','HEAD','OPTIONS','TRACE','CONNECT','_OTHER']);
function safeRoute(value) {
  if (typeof value !== 'string' || value.length > 180 || !/^\/[A-Za-z0-9_/:.*{}-]*$/.test(value)) return undefined;
  return value.split('/').map(s => /^[:*{]/.test(s) ? ':id' : /\d/.test(s) || s.length > 32 ? ':id' : s).join('/');
}
function sanitizeSpan(span) {
  const input = span.attributes, attributes = {};
  const method = input['http.request.method'] ?? input['http.method'];
  const system = input['db.system.name'] ?? input['db.system'];
  const database = span.kind === 2 && systems.has(system) && !methods.has(method);
  if (span.kind !== 1 && span.kind !== 2 || !database && !methods.has(method)) return null;
  if (database) {
    attributes['db.system.name'] = system;
    const operation = input['db.operation.name'] ?? input['db.operation'];
    if (typeof operation === 'string' && operations.has(operation.toUpperCase())) attributes['db.operation.name'] = operation.toUpperCase();
  } else {
    attributes['http.request.method'] = method;
    const status = Number(input['http.response.status_code'] ?? input['http.status_code']);
    if (Number.isInteger(status) && status >= 100 && status <= 599) attributes['http.response.status_code'] = status;
    const route = span.kind === 1 ? safeRoute(input['http.route']) : undefined;
    if (route) attributes['http.route'] = route;
  }
  const error = input['error.type'] ?? span.events?.find(e => e.name === 'exception')?.attributes?.['exception.type'];
  if (typeof error === 'string' && error) attributes['error.type'] = errors.has(error) ? error : 'Error';
  const context = value => value && ({ traceId:value.traceId, spanId:value.spanId, traceFlags:value.traceFlags });
  // Build a fresh projection: no original resource, events, query, status message,
  // connection string, table/collection name, URL, headers, links or span name escapes.
  return {
    name: database ? `${system} ${attributes['db.operation.name'] || 'query'}` : `HTTP ${method}`,
    kind: span.kind, spanContext: () => context(span.spanContext()), parentSpanContext: context(span.parentSpanContext),
    startTime: span.startTime, endTime: span.endTime, duration: span.duration, ended: span.ended,
    status: { code: span.status.code }, attributes, events: [], links: [],
    resource: resourceFromAttributes({ 'service.name': /^[A-Za-z][A-Za-z0-9_.-]{0,99}$/.test(process.env.OTEL_SERVICE_NAME || '') ? process.env.OTEL_SERVICE_NAME : 'node-service' }),
    instrumentationScope: { name: 'to-monitoring-safe-export' },
    droppedAttributesCount: 0, droppedEventsCount: 0, droppedLinksCount: 0,
  };
}
if (process.env.OTEL_SDK_DISABLED !== 'true') {
  const exporter = new OTLPTraceExporter(); // Uses the documented OTEL endpoint/header variables.
  const safeExporter = {
    export(spans, callback) {
      const safe = spans.map(sanitizeSpan).filter(Boolean);
      if (!safe.length) return callback({ code: 0 });
      exporter.export(safe, callback);
    },
    shutdown: () => exporter.shutdown(),
  };
  const sdk = new NodeSDK({
    autoDetectResources: false,
    resource: resourceFromAttributes({ 'service.name': process.env.OTEL_SERVICE_NAME || 'node-service' }),
    spanProcessors: [new BatchSpanProcessor({ exporter: safeExporter, maxExportBatchSize: 100, maxQueueSize: 1000, scheduledDelayMillis: 1000 })],
    instrumentations: [getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-mongodb': { enhancedDatabaseReporting: false, dbStatementSerializer: () => '' },
      '@opentelemetry/instrumentation-mysql2': { maskStatement: true, maskStatementHook: () => '', addSqlCommenterCommentToQueries: false },
      '@opentelemetry/instrumentation-mongoose': { enabled: false },
    })],
  });
  sdk.start();
  process.once('SIGTERM', () => { void sdk.shutdown(); });
  process.once('beforeExit', () => { void sdk.shutdown(); });
}
module.exports = { sanitizeSpan };
