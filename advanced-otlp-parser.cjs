'use strict';
// Fixed-field projection: never persist an arbitrary span/attribute/event object.
const METHODS = new Set(['GET','POST','PUT','PATCH','DELETE','HEAD','OPTIONS','TRACE','CONNECT','_OTHER']);
const SYSTEMS = new Set(['mysql','postgresql','sqlite','redis','mongodb']);
const OPERATIONS = new Set(['SELECT','INSERT','UPDATE','DELETE','CREATE','ALTER','DROP','BEGIN','COMMIT','ROLLBACK','GET','SET','DEL','FIND','FINDONE','AGGREGATE','COUNT','PING','EXECUTE']);
const ERRORS = new Set(['Error','TypeError','RangeError','SyntaxError','ReferenceError','TimeoutError','AbortError','ECONNREFUSED','ECONNRESET','ETIMEDOUT','ENOTFOUND','timeout']);
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
function attributes(input = []) {
  if (!Array.isArray(input) || input.length > 64) fail('Invalid or excessive attributes');
  const result = new Map();
  for (const a of input) {
    if (!a || typeof a.key !== 'string' || !a.key || a.key.length > 128 || /[\x00-\x1f\x7f]/.test(a.key) || result.has(a.key)) fail('Invalid or duplicate attribute key');
    const v = a.value;
    if (!v || typeof v !== 'object' || Array.isArray(v) || Object.keys(v).length !== 1) fail('Invalid scalar attribute');
    const [type] = Object.keys(v), value = v[type];
    // Default SDK resource detectors emit arrays such as process.command_args.
    // Validate bounded scalar arrays but never retain them in the projection.
    if (type === 'arrayValue') {
      if (!value || typeof value !== 'object' || Object.keys(value).some(k => k !== 'values') || !Array.isArray(value.values) || value.values.length > 32) fail('Invalid attribute array');
      if (value.values.some(item => item && typeof item === 'object' && ('arrayValue' in item || 'kvlistValue' in item))) fail('Nested attribute containers unsupported');
      attributes(value.values.map((item, i) => ({ key: String(i), value: item })));
      result.set(a.key, undefined);
      continue;
    }
    if (!(type === 'stringValue' && typeof value === 'string' && value.length <= 4096
      || type === 'intValue' && (typeof value === 'string' && /^-?\d{1,19}$/.test(value) || Number.isSafeInteger(value))
      || type === 'boolValue' && typeof value === 'boolean'
      || type === 'doubleValue' && typeof value === 'number' && Number.isFinite(value))) fail('Invalid scalar attribute');
    result.set(a.key, value);
  }
  return result;
}
function id(value, length, optional = false) {
  if (optional && (value === undefined || value === '')) return null;
  if (typeof value !== 'string' || !new RegExp(`^[a-fA-F0-9]{${length}}$`).test(value) || /^0+$/.test(value)) fail('Invalid trace/span identifier');
  return value.toLowerCase();
}
function timestamp(value) {
  if (typeof value !== 'string' || !/^\d{1,20}$/.test(value)) fail('Invalid span timestamp');
  return BigInt(value);
}
function route(value) {
  if (typeof value !== 'string' || value.length > 180 || !/^\/[A-Za-z0-9_/:.*{}-]*$/.test(value)) return null;
  return value.split('/').map(segment => /^[:*{]/.test(segment) ? segment
    : /\d/.test(segment) || segment.length > 32 ? ':id' : segment).join('/');
}
function parseAdvancedSpans(body, projectId, now = Date.now()) {
  if (!body || !Array.isArray(body.resourceSpans)) fail('Expected OTLP resourceSpans array');
  if (body.resourceSpans.length > 10) fail('Too many resources', 413);
  const rows = []; let total = 0;
  for (const resource of body.resourceSpans) {
    if (!resource || !Array.isArray(resource.scopeSpans) || resource.scopeSpans.length > 25) fail('Invalid scopeSpans');
    const r = attributes(resource.resource?.attributes);
    const service = r.get('service.name');
    const serviceName = typeof service === 'string' && /^[A-Za-z][A-Za-z0-9_.-]{0,99}$/.test(service) ? service : 'node-service';
    const env = r.get('deployment.environment.name') ?? r.get('deployment.environment');
    const version = r.get('service.version');
    for (const scope of resource.scopeSpans) {
      if (!scope || !Array.isArray(scope.spans)) fail('Invalid spans array');
      for (const span of scope.spans) {
        if (++total > 100) fail('Too many spans; send smaller batches', 413);
        if (!span || typeof span !== 'object' || Array.isArray(span)) fail('Invalid span');
        const a = attributes(span.attributes);
        const events = span.events ?? [];
        if (!Array.isArray(events) || events.length > 16) fail('Invalid or excessive span events');
        let exception;
        for (const event of events) {
          if (!event || typeof event.name !== 'string' || !event.name || event.name.length > 128 || /[\x00-\x1f\x7f]/.test(event.name)) fail('Invalid event');
          if (event.timeUnixNano !== undefined) timestamp(event.timeUnixNano);
          const ea = attributes(event.attributes);
          if (event.name === 'exception') exception ??= ea.get('exception.type');
        }
        // Validate IDs and timing even for excluded spans; all input consumes limits.
        const traceId = id(span.traceId, 32), spanId = id(span.spanId, 16), parentId = id(span.parentSpanId, 16, true);
        if (spanId === parentId) fail('Span cannot parent itself');
        const start = timestamp(span.startTimeUnixNano), end = timestamp(span.endTimeUnixNano);
        const startMs = Number(start / 1000000n);
        if (end < start || end - start > 86400000000000n || startMs < now - 7 * 86400000 || Number(end / 1000000n) > now + 300000) fail('Span timestamps outside collection window');
        const kind = span.kind === 2 || span.kind === 'SPAN_KIND_SERVER' ? 'SERVER'
          : span.kind === 3 || span.kind === 'SPAN_KIND_CLIENT' ? 'CLIENT' : null;
        let method = a.get('http.request.method') ?? a.get('http.method');
        method = typeof method === 'string' && METHODS.has(method) ? method : null;
        const system = a.get('db.system.name') ?? a.get('db.system');
        const database = kind === 'CLIENT' && SYSTEMS.has(system) && !method;
        if (!kind || !method && !database) continue;
        let status = a.get('http.response.status_code') ?? a.get('http.status_code');
        status = typeof status === 'string' && /^\d{3}$/.test(status) ? Number(status) : status;
        status = method && Number.isInteger(status) && status >= 100 && status <= 599 ? status : null;
        const rawOperation = a.get('db.operation.name') ?? a.get('db.operation');
        const operation = database && typeof rawOperation === 'string' && OPERATIONS.has(rawOperation.toUpperCase()) ? rawOperation.toUpperCase() : database ? 'query' : null;
        const error = a.get('error.type') ?? exception;
        const errorType = typeof error === 'string' && error ? ERRORS.has(error) ? error : 'Error' : null;
        rows.push({ project_id: projectId, started_at: new Date(startMs).toISOString(), service_name: serviceName,
          trace_id: traceId, span_id: spanId, parent_span_id: parentId, span_kind: kind,
          span_name: database ? `${system} ${operation}` : `HTTP ${kind} ${method}`,
          environment: ['development','staging','production','test'].includes(env) ? env : null,
          service_version: typeof version === 'string' && /^\d{1,5}\.\d{1,5}\.\d{1,5}$/.test(version) ? version : null,
          db_system: database ? system : null, db_operation: operation, error_type: errorType,
          http_method: method, http_route: kind === 'SERVER' ? route(a.get('http.route')) : null, http_status: status,
          duration_ms: Math.round(Number(end - start) / 1000) / 1000,
          span_error: span.status?.code === 2 || span.status?.code === 'STATUS_CODE_ERROR' || !!errorType || status !== null && status >= (kind === 'CLIENT' ? 400 : 500),
        });
      }
    }
  }
  return rows;
}
module.exports = { parseAdvancedSpans };
