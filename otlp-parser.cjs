'use strict';

// Minimal, intentionally privacy-limited OTLP/HTTP-JSON trace decoder.
// Stores HTTP SERVER spans only, and only whitelisted fields.
// It is NOT a general OTLP/JSON validator, logs collector, or protobuf decoder.
const MAX_SPANS = 100;
const HEX32 = /^[0-9a-fA-F]{32}$/;
const HEX16 = /^[0-9a-fA-F]{16}$/;
const ALLOWED_METHODS = new Set(['GET','POST','PUT','PATCH','DELETE','HEAD','OPTIONS','TRACE','CONNECT']);

function otlpValue(attrs, key) {
  if (!Array.isArray(attrs)) return undefined;
  const a = attrs.find(x => x && x.key === key);
  if (!a || !a.value || typeof a.value !== 'object') return undefined;
  return a.value.stringValue ?? a.value.intValue ?? a.value.boolValue;
}
function nsToBigInt(input) {
  if (typeof input !== 'string' || !/^\d{1,20}$/.test(input)) return null;
  try { return BigInt(input); } catch { return null; }
}
function nsToIso(ns) {
  const ms = ns / 1000000n;
  if (ms < 0n || ms > BigInt(8640000000000000)) return null;
  const d = new Date(Number(ms));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
function parseOtlpHttpSpans(body, projectId) {
  if (!body || !Array.isArray(body.resourceSpans)) {
    throw Object.assign(new Error('Expected OTLP resourceSpans array'), { status: 400 });
  }
  if (body.resourceSpans.length > 10) {
    throw Object.assign(new Error('Too many resources'), { status: 413 });
  }
  let total = 0;
  const spans = [];
  for (const resource of body.resourceSpans) {
    if (!resource || typeof resource !== 'object' || !Array.isArray(resource.scopeSpans) || resource.scopeSpans.length > 25) {
      throw Object.assign(new Error('Invalid scopeSpans or too many scopes'), { status: 400 });
    }
    const serviceValue = otlpValue(resource.resource?.attributes, 'service.name');
    const service = typeof serviceValue === 'string' ? serviceValue.trim().slice(0, 100) : 'node-service';
    for (const scope of resource.scopeSpans) {
      if (!scope || typeof scope !== 'object' || !Array.isArray(scope.spans)) {
        throw Object.assign(new Error('Invalid OTLP spans array'), { status: 400 });
      }
      for (const span of scope.spans) {
        if (!span || typeof span !== 'object') {
          throw Object.assign(new Error('Invalid OTLP span'), { status: 400 });
        }
        total++;
        if (total > MAX_SPANS) {
          throw Object.assign(new Error('Too many spans; send smaller batches'), { status: 413 });
        }
        if (Number(span.kind) !== 2 && span.kind !== 'SPAN_KIND_SERVER') continue;
        if (!HEX32.test(span.traceId || '') || !HEX16.test(span.spanId || '') || /^0+$/.test(span.traceId) || /^0+$/.test(span.spanId)) {
          throw Object.assign(new Error('Invalid traceId/spanId'), { status: 400 });
        }
        const start = nsToBigInt(span.startTimeUnixNano);
        const end = nsToBigInt(span.endTimeUnixNano);
        if (start === null || end === null || end < start || !nsToIso(start)) {
          throw Object.assign(new Error('Invalid span timestamps'), { status: 400 });
        }
        let method = otlpValue(span.attributes, 'http.request.method') ?? otlpValue(span.attributes, 'http.method');
        method = typeof method === 'string' && ALLOWED_METHODS.has(method.toUpperCase())
          ? method.toUpperCase() : null;
        if (!method) continue; // SERVER spans for other protocols are not HTTP telemetry.
        // Only matched route templates, not URL paths or query strings (PII protection).
        let route = otlpValue(span.attributes, 'http.route');
        route = typeof route === 'string' && route.startsWith('/') && !/[?#\x00-\x1f\x7f]/.test(route)
          ? route.slice(0, 180) : null;
        let status = otlpValue(span.attributes, 'http.response.status_code')
          ?? otlpValue(span.attributes, 'http.status_code');
        status = Number(status);
        status = Number.isInteger(status) && status >= 100 && status <= 599 ? status : null;
        const duration = Number(end - start) / 1000000;
        if (!Number.isFinite(duration) || duration > 86400000) {
          throw Object.assign(new Error('HTTP span duration must not exceed 24 hours'), { status: 400 });
        }
        spans.push({
          project_id: projectId,
          started_at: nsToIso(start),
          service_name: service || 'node-service',
          trace_id: span.traceId.toLowerCase(),
          span_id: span.spanId.toLowerCase(),
          http_method: method,
          http_route: route,
          http_status: status,
          duration_ms: Number.isFinite(duration) ? Math.round(duration * 1000) / 1000 : null,
          span_error: Number(span.status?.code) === 2 || span.status?.code === 'STATUS_CODE_ERROR' || (status !== null && status >= 500),
        });
      }
    }
  }
  return spans;
}
module.exports = { parseOtlpHttpSpans, MAX_SPANS };
