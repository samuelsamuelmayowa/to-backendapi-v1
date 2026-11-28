'use strict';
const { test }=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const { spawn }=require('node:child_process');
const { pathToFileURL }=require('node:url');
const { fixture,register }=require('../../tests/helpers/monitoringFixture');
const canonical=path.resolve(__dirname,'../../examples/monitoring-node/monitoring-preload.cjs');
const local=path.join(__dirname,'monitoring-preload.cjs');fs.copyFileSync(canonical,local);
const versions={};for(const name of ['@opentelemetry/auto-instrumentations-node','@opentelemetry/sdk-node','@opentelemetry/instrumentation-mongodb','@opentelemetry/instrumentation-mongoose','mongodb','mongoose','mysql2']) versions[name]=JSON.parse(fs.readFileSync(path.join(__dirname,'node_modules',name,'package.json'))).version;
for(const mode of ['http','mysql2','mongodb','mongoose']) test(`controlled ${mode}: private export, receiver ingestion and trace correlation`,{timeout:240000},async t=>{
  let database;
  if(mode==='mongodb'||mode==='mongoose') {
    const {MongoMemoryServer}=require('mongodb-memory-server');
    database=await MongoMemoryServer.create({binary:{version:'7.0.24',downloadDir:path.join(__dirname,'.cache')},instance:{ip:'127.0.0.1',dbName:'monitoring_test'}});
    t.after(()=>database.stop());
  }
  const raw=[], receipts=[];
  const f=await fixture({advancedTraces:true,onExport:(body,status)=>{raw.push(body);receipts.push(status)}});t.after(f.close);
  const {project,secret}=await register(f);
  const {otelEnvironment}=await import(pathToFileURL(path.resolve(__dirname,'../../../to-monitoring/src/lib/otelSetup.js')));
  const env={};for(const name of ['PATH','Path','SystemRoot','SYSTEMROOT','COMSPEC','PATHEXT','WINDIR','TEMP','TMP','USERPROFILE','APPDATA','LOCALAPPDATA']) if(process.env[name])env[name]=process.env[name];
  Object.assign(env,otelEnvironment({integration:mode,name:'controlled-test',endpoint:f.root+'/otlp/v1/traces',secret}),{MONITORING_TEST_MODE:mode});
  if(database)env.MONITORING_TEST_MONGO_URI=database.getUri('monitoring_test').replace(/\/$/,'');
  const child=spawn(process.execPath,['--require',local,'app.cjs'],{cwd:__dirname,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
  t.after(()=>child.kill());
  child.stderr.resume();
  const port=await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('Controlled app startup timed out')),45000);
    let output='';child.stdout.on('data',chunk=>{output+=chunk;const match=output.match(/READY (\d+)/);if(match){clearTimeout(timer);resolve(Number(match[1]));}});
    child.on('error',()=>{clearTimeout(timer);reject(new Error('Controlled app spawn failed'));});
    child.on('exit',code=>{clearTimeout(timer);reject(new Error(`Controlled app exited before readiness (${code})`));});
  });
  const response=await fetch(`http://127.0.0.1:${port}/${mode==='http'?'health':'database'}`);await response.arrayBuffer();assert.equal(response.status,200);
  if(database){const failed=await fetch(`http://127.0.0.1:${port}/failure`);await failed.arrayBuffer();assert.equal(failed.status,500);}
  const deadline=Date.now()+12000;
  while(Date.now()<deadline){if(f.supabase.rows.monitoring_spans.filter(s=>s.span_kind==='SERVER').length>=(database?2:1))break;await new Promise(resolve=>setTimeout(resolve,100));}
  const rows=f.supabase.rows.monitoring_spans;
  assert.ok(rows.some(s=>s.span_kind==='SERVER'),`SERVER missing; receiver statuses ${JSON.stringify(receipts)}; received batches ${raw.length}`);
  assert.ok(!JSON.stringify(raw).includes('DO_NOT_EXPORT_PRIVATE'),'private contents must be removed before the receiver');
  assert.ok(!JSON.stringify(rows).includes('DO_NOT_EXPORT_PRIVATE'));
  if(mode!=='http'){
    const databaseRows=rows.filter(s=>s.span_kind==='CLIENT'&&s.db_system===(mode==='mysql2'?'mysql':'mongodb'));
    assert.ok(databaseRows.length>=1,'official database CLIENT span reaches receiver');
    for(const row of databaseRows){assert.ok(row.started_at&&Number.isFinite(row.duration_ms)&&row.duration_ms>=0);assert.match(row.trace_id,/^[0-9a-f]{32}$/);assert.match(row.span_id,/^[0-9a-f]{16}$/);assert.equal(row.project_id,project.id);assert.ok(rows.some(s=>s.span_kind==='SERVER'&&s.trace_id===row.trace_id));assert.match(row.db_operation,/^(FIND|SELECT|query)$/);}
    if(database)assert.ok(databaseRows.some(s=>s.span_error),'recorded database failure survives safe projection');
    const trace=rows.find(s=>s.span_kind==='SERVER'&&s.http_route==='/database').trace_id;
    const data=await(await f.request(`/api/monitoring/projects/${project.id}/spans?trace_id=${trace}&limit=100`)).json();
    assert.ok(data.spans.some(s=>s.db_system));
    assert.equal((await f.request(`/api/monitoring/projects/${project.id}/spans?trace_id=${trace}`,{user:'other-owner'})).status,404);
    if(mode==='mongoose')assert.equal(databaseRows.filter(s=>s.trace_id===trace).length,1,'one underlying driver operation, no duplicate ODM span');
  }
  t.diagnostic(JSON.stringify({mode,node:process.version,versions,stored:rows.length,productionRequests:0,privateFieldsExported:false}));
});
