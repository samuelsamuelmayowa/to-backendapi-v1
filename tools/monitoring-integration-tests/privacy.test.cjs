const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
fs.copyFileSync(path.resolve(__dirname,'../../examples/monitoring-node/monitoring-preload.cjs'),path.join(__dirname,'monitoring-preload.cjs'));
process.env.OTEL_SDK_DISABLED='true';process.env.OTEL_SERVICE_NAME='safe-test';
const {sanitizeSpan}=require('./monitoring-preload.cjs');
const span=()=>({kind:2,name:'private_DO_NOT_EXPORT',attributes:{'db.system.name':'mongodb','db.operation.name':'find','db.query.text':'DO_NOT_EXPORT','db.collection.name':'DO_NOT_EXPORT','db.namespace':'DO_NOT_EXPORT','server.address':'DO_NOT_EXPORT','url.full':'DO_NOT_EXPORT'},events:[{name:'exception',attributes:{'exception.type':'PrivateError','exception.message':'DO_NOT_EXPORT'}}],links:[{attributes:{secret:'DO_NOT_EXPORT'}}],resource:{attributes:{secret:'DO_NOT_EXPORT'}},status:{code:2,message:'DO_NOT_EXPORT'},spanContext:()=>({traceId:'a'.repeat(32),spanId:'b'.repeat(16),traceFlags:1,traceState:'DO_NOT_EXPORT'}),startTime:[1,0],endTime:[1,1000],duration:[0,1000],ended:true});
test('privacy exporter rejects query contents, identifiers, records, credentials, events and raw errors before ingestion',()=>{
 const safe=sanitizeSpan(span());assert.equal(safe.kind,2);assert.equal(safe.attributes['db.operation.name'],'FIND');assert.equal(safe.attributes['error.type'],'Error');assert.equal(safe.status.code,2);assert.ok(!JSON.stringify(safe).includes('DO_NOT_EXPORT'));assert.ok(!JSON.stringify(safe.spanContext()).includes('DO_NOT_EXPORT'));
 const original=span();original.attributes['db.operation.name']='find private';assert.equal(sanitizeSpan(original).name,'mongodb query');
 original.kind=0;assert.equal(sanitizeSpan(original),null);
});
test('normalizes safe HTTP metadata and preserves timing/context without query strings',()=>{
 const original=span();original.kind=1;original.attributes={'http.request.method':'GET','http.route':'/users/123','http.response.status_code':304,'http.url':'https://secret.invalid/?token=DO_NOT_EXPORT'};
 const safe=sanitizeSpan(original);assert.equal(safe.attributes['http.route'],'/users/:id');assert.equal(safe.attributes['http.response.status_code'],304);assert.deepEqual(safe.startTime,original.startTime);assert.ok(!JSON.stringify(safe).includes('DO_NOT_EXPORT'));
});
test('downloadable preload is identical to tested canonical source',()=>{
 assert.equal(fs.readFileSync(path.resolve(__dirname,'../../examples/monitoring-node/monitoring-preload.cjs'),'utf8'),fs.readFileSync(path.resolve(__dirname,'../../../to-monitoring/public/monitoring-preload.cjs'),'utf8'));
});
