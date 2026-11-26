'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseAdvancedSpans } = require('../advanced-otlp-parser.cjs');
const { fixture, payload, register } = require('./helpers/monitoringFixture');
const attr = (key, value) => ({ key, value: { stringValue: value } });
function correlated() {
  const body = payload();
  const spans = body.resourceSpans[0].scopeSpans[0].spans, server = spans[0];
  server.name = 'SENSITIVE_NOT_STORED';
  body.resourceSpans[0].resource.attributes.push(attr('deployment.environment.name','production'), attr('service.version','1.2.3'));
  spans.push({ ...server, kind: 3, parentSpanId: server.spanId, spanId: '123456789abcdef0', attributes: [attr('http.method','GET'),attr('http.url','https://secret:password@host/path?token=SENSITIVE_NOT_STORED'),{key:'http.status_code',value:{intValue:404}}] });
  spans.push({ ...server, kind: 'SPAN_KIND_CLIENT', parentSpanId: server.spanId, spanId: '123456789abcdef1', attributes: [attr('db.system.name','mysql'),attr('db.operation.name','SELECT'),attr('db.query.text','SELECT SENSITIVE_NOT_STORED')],events:[{name:'exception',attributes:[attr('exception.type','TimeoutError'),attr('exception.message','SENSITIVE_NOT_STORED'),attr('exception.stacktrace','SENSITIVE_NOT_STORED')]}] });
  return body;
}
test('projects correlated HTTP and DB dependencies to fixed safe fields', () => {
  const rows = parseAdvancedSpans(correlated(), 'project');
  assert.equal(rows.length,3);
  assert.equal(rows[1].parent_span_id,rows[0].span_id);
  assert.equal(rows[1].trace_id,rows[0].trace_id);
  assert.equal(rows[1].span_error,true); // HTTP client 404, unlike server 404.
  assert.equal(rows[2].span_name,'mysql SELECT');
  assert.equal(rows[2].http_method,null);
  assert.equal(rows[2].error_type,'TimeoutError');
  assert.equal(rows[0].environment,'production');
  assert.equal(rows[0].service_version,'1.2.3');
  assert.ok(!JSON.stringify(rows).includes('SENSITIVE_NOT_STORED'));
});
test('handles legacy DB attributes without ever deriving operations from SQL', () => {
  const body=correlated(), s=body.resourceSpans[0].scopeSpans[0].spans[2];
  s.attributes=[attr('db.system','postgresql'),attr('db.statement','SELECT secret')];
  s.events=[{name:'exception',attributes:[attr('exception.type','private.customer.token')]}];
  const row=parseAdvancedSpans(body,'project')[2];
  assert.equal(row.db_operation,'query'); assert.equal(row.error_type,'Error');
  s.attributes.push(attr('db.operation','findOne')); assert.equal(parseAdvancedSpans(body,'project')[2].db_operation,'FINDONE');
});
test('normalizes opaque routes and omits unsupported span kinds and DB systems', () => {
  const body=correlated(), spans=body.resourceSpans[0].scopeSpans[0].spans;
  spans[0].attributes=[attr('http.request.method','GET'),attr('http.route','/users/123/orders/:id')];
  spans[1].kind=1;spans[2].attributes=[attr('db.system','unknown')];
  const rows=parseAdvancedSpans(body,'project');assert.equal(rows.length,1);assert.equal(rows[0].http_route,'/users/:id/orders/:id');
});
test('rejects malformed scalar/duplicate/excess attributes, events, IDs, times and batches', () => {
  const mutations=[
    s=>s.attributes.push(s.attributes[0]),
    s=>s.attributes.push({key:'nested',value:{arrayValue:{values:[{arrayValue:{values:[]}}]}}}),
    s=>s.attributes.push(attr('huge','x'.repeat(4097))),
    s=>s.attributes=Array.from({length:65},(_,i)=>attr('a'+i,'x')),
    s=>s.events=Array.from({length:17},()=>({name:'exception'})),
    s=>s.parentSpanId='0'.repeat(16),s=>s.parentSpanId=s.spanId,
    s=>s.traceId='bad',s=>s.startTimeUnixNano='1',s=>s.endTimeUnixNano=s.startTimeUnixNano+'0000000',
  ];
  for(const mutate of mutations){const b=correlated();mutate(b.resourceSpans[0].scopeSpans[0].spans[0]);assert.throws(()=>parseAdvancedSpans(b,'project'),e=>e.status===400);}
  const b=correlated();b.resourceSpans[0].scopeSpans[0].spans=Array(101).fill(b.resourceSpans[0].scopeSpans[0].spans[0]);assert.throws(()=>parseAdvancedSpans(b,'project'),e=>e.status===413);
});
test('accepts and discards bounded official SDK resource arrays', () => {
  const body=correlated();
  body.resourceSpans[0].resource.attributes.push({key:'process.command_args',value:{arrayValue:{values:[{stringValue:'PRIVATE_PROCESS_ARGUMENT'}]}}});
  const rows=parseAdvancedSpans(body,'project');assert.equal(rows.length,3);assert.ok(!JSON.stringify(rows).includes('PRIVATE_PROCESS_ARGUMENT'));
});
test('advanced receiver uses existing auth, project scope, revocation, quotas and safe reads', async t => {
  const f=await fixture({advancedTraces:true});t.after(f.close);
  const {project,secret,key}=await register(f);
  const body=correlated();
  const send=()=>f.request('/otlp/v1/traces',{user:null,method:'POST',body,headers:{'x-to-project-key':secret}});
  assert.equal((await send()).status,200);
  assert.equal(f.supabase.rows.monitoring_spans.length,3);
  assert.ok(f.supabase.rpcCalls.includes('monitoring_ingest_spans_v2'));
  assert.equal((await send()).headers.get('x-to-stored-spans'),'0');
  const trace=body.resourceSpans[0].scopeSpans[0].spans[0].traceId;
  const path=`/api/monitoring/projects/${project.id}/spans?trace_id=${trace}`;
  assert.equal((await f.request(path,{user:'other-owner'})).status,404);
  assert.equal((await f.request(path,{user:null})).status,401);
  assert.equal((await (await f.request(path)).json()).spans.length,3);
  assert.equal((await (await f.request(`/api/monitoring/projects/${project.id}/status`)).json()).span_count,1);
  assert.equal((await (await f.request(`/api/monitoring/projects/${project.id}/spans`)).json()).spans.length,1);
  assert.equal((await f.request(`/api/monitoring/projects/${project.id}/spans?trace_id=bad`)).status,400);
  f.supabase.quotaExceeded=true;assert.equal((await send()).status,429);f.supabase.quotaExceeded=false;
  await f.request(`/api/monitoring/projects/${project.id}/keys/${key.id}`,{method:'DELETE'});
  assert.equal((await send()).status,401);
});
test('default receiver preserves old RPC/server-only behavior; missing advanced schema fails closed', async t => {
  const f=await fixture({advancedTraces:false});t.after(f.close);const {secret}=await register(f);
  assert.equal((await f.request('/otlp/v1/traces',{user:null,method:'POST',body:correlated(),headers:{'x-to-project-key':secret}})).status,200);
  assert.equal(f.supabase.rows.monitoring_spans.length,1);
  assert.ok(f.supabase.rpcCalls.includes('monitoring_ingest_spans'));
  const advanced=await fixture({advancedTraces:true});t.after(advanced.close);const registered=await register(advanced);
  const original=advanced.supabase.rpc;
  advanced.supabase.rpc=(name,args)=>name==='monitoring_ingest_spans_v2'?{error:{code:'PGRST202',message:'PRIVATE'}}:original(name,args);
  const result=await advanced.request('/otlp/v1/traces',{user:null,method:'POST',body:correlated(),headers:{'x-to-project-key':registered.secret}});
  assert.equal(result.status,503);assert.ok(!(await result.text()).includes('PRIVATE'));
});
test('collection rollback retains advanced read support while using legacy server-only ingestion', async t => {
  const f=await fixture({advancedTraces:true,advancedIngest:false});t.after(f.close);const {project,secret}=await register(f);
  const body=correlated(), trace=body.resourceSpans[0].scopeSpans[0].spans[0].traceId;
  assert.equal((await f.request('/otlp/v1/traces',{user:null,method:'POST',body,headers:{'x-to-project-key':secret}})).status,200);
  assert.equal(f.supabase.rows.monitoring_spans.length,1);assert.ok(f.supabase.rpcCalls.includes('monitoring_ingest_spans'));
  assert.equal((await f.request(`/api/monitoring/projects/${project.id}/spans?trace_id=${trace}`)).status,200);
  assert.equal((await (await f.request(`/api/monitoring/projects/${project.id}/status`)).json()).span_count,1);
});
