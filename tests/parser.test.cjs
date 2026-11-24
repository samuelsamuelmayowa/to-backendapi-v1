'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseOtlpHttpSpans } = require('../backend/otlp-parser.cjs');
const projectId = '3a92e633-fc60-4502-a9fa-32dcda116170';
const t = BigInt(Date.now()) * 1000000n;
const span = {
  kind: 2,
  traceId: '0123456789abcdef0123456789abcdef',
  spanId: '0123456789abcdef',
  startTimeUnixNano: String(t),
  endTimeUnixNano: String(t + 45000000n),
  attributes: [
    { key:'http.request.method', value:{ stringValue:'GET' } },
    { key:'http.route', value:{ stringValue:'/api/products' } },
    { key:'http.response.status_code', value:{ intValue:'200' } },
    { key:'url.full', value:{ stringValue:'https://localhost/private?token=DO_NOT_STORE' } },
  ]
};
const mk = x => ({ resourceSpans: [{ resource: { attributes:[{ key:'service.name', value:{stringValue:'shopping-api'}}] }, scopeSpans:[{ spans:[x] }] }] });
test('parses OTLP HTTP server span and drops sensitive attributes', () => {
  const [row] = parseOtlpHttpSpans(mk(span), projectId);
  assert.equal(row.project_id, projectId);
  assert.equal(row.service_name, 'shopping-api');
  assert.equal(row.http_method, 'GET');
  assert.equal(row.http_route, '/api/products');
  assert.equal(row.http_status, 200);
  assert.equal(row.duration_ms, 45);
  assert.equal(row.span_error, false);
  assert.ok(!JSON.stringify(row).includes('DO_NOT_STORE'));
});
test('omits non-server spans', () => {
  assert.deepEqual(parseOtlpHttpSpans(mk({...span, kind:3}), projectId), []);
});
test('rejects malformed ids', () => {
  assert.throws(() => parseOtlpHttpSpans(mk({...span, traceId:'1234'}), projectId), /Invalid traceId/);
});
test('rejects unknown/unsafe route path with query string', () => {
  const [row] = parseOtlpHttpSpans(mk({...span, attributes:[{key:'http.route',value:{stringValue:'/foo?token=SECRET'}}]}),projectId);
  assert.equal(row.http_route, null);
});
test('enforces maximum number of spans', () => {
  const many = mk(span); many.resourceSpans[0].scopeSpans[0].spans = Array.from({ length:101 }, () => span);
  assert.throws(() => parseOtlpHttpSpans(many, projectId), /Too many spans/);
});
