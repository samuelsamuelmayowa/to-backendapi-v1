'use strict';
const path = require('node:path');
const fs = require('node:fs');
const { createRequire } = require('node:module');
const { createHash } = require('node:crypto');
const { spawn } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const { fixture } = require('../tests/helpers/monitoringFixture');

// Explicitly invoked local experiment. Does not load any .env or application
// entry point. Production database/OTLP destinations cannot be passed to it.
(async () => {
  const appDirectory = process.argv[2];
  if (!appDirectory || !path.isAbsolute(appDirectory)) throw new Error('Supply the absolute Node application directory to inspect installed packages.');
  const appRequire = createRequire(path.join(appDirectory,'package.json'));
  const register = appRequire.resolve('@opentelemetry/auto-instrumentations-node/register');
  const expressPath = appRequire.resolve('express');
  const version = name => JSON.parse(fs.readFileSync(path.join(appDirectory,'node_modules',name,'package.json'),'utf8')).version;
  const dependencies = process.argv.includes('--dependencies');
  const mysql = process.argv.includes('--mysql');
  const success = process.argv.includes('--mysql-success');
  const withExpress = process.argv.includes('--express');
  const postgres = process.argv.includes('--postgres')
    ? await require('./monitoring-db-tests/probeStorage.cjs').createProbeStorage() : null;
  const exported = [], receipts = [];
  const f = await fixture({ advancedTraces: dependencies || mysql, storage: postgres?.supabase,
    onExport(body, status, stored) {
      receipts.push({ status, stored });
      // Retain only graph metadata in test memory; never log arbitrary OTLP.
      for (const resource of body?.resourceSpans || []) for (const scope of resource.scopeSpans || []) for (const span of scope.spans || []) {
        exported.push({ trace: span.traceId, id: span.spanId, parent: span.parentSpanId, kind: span.kind });
      }
    } });
  const projectId='11111111-1111-4111-8111-111111111111';
  const secret='to_live_'+'x'.repeat(43); // Static test credential, never a real key.
  f.supabase.rows.monitoring_projects.push({id:projectId,owner_user_id:'owner-a',name:'Local probe'});
  f.supabase.rows.monitoring_project_keys.push({id:'22222222-2222-4222-8222-222222222222',project_id:projectId,key_hash:createHash('sha256').update(secret).digest('hex'),key_prefix:'to_live_xxxxxxxx',revoked_at:null});
  let child;
  try {
    if (postgres) await postgres.seed(f.supabase.rows);
    const env={};
    for(const name of ['PATH','Path','SystemRoot','SYSTEMROOT','COMSPEC','PATHEXT','WINDIR','TEMP','TMP','USERPROFILE','HOME','APPDATA','LOCALAPPDATA']) if(process.env[name])env[name]=process.env[name];
    Object.assign(env,{
      MONITORING_TEST_EXPRESS_PATH:expressPath,
      OTEL_SERVICE_NAME:'local-mafaconnect-probe',OTEL_TRACES_EXPORTER:'otlp',
      OTEL_EXPORTER_OTLP_TRACES_PROTOCOL:'http/json',OTEL_EXPORTER_OTLP_TRACES_ENDPOINT:f.root+'/otlp/v1/traces',
      OTEL_EXPORTER_OTLP_TRACES_HEADERS:'x-to-project-key='+secret,
      OTEL_METRICS_EXPORTER:'none',OTEL_LOGS_EXPORTER:'none',OTEL_NODE_ENABLED_INSTRUMENTATIONS:'http,express',
      OTEL_NODE_RESOURCE_DETECTORS:'env',OTEL_BSP_MAX_EXPORT_BATCH_SIZE:'100',OTEL_BSP_MAX_QUEUE_SIZE:'1000',OTEL_BSP_SCHEDULE_DELAY:'100',
    });
    // HTTP-only here gives a direct SERVER->CLIENT edge without excluded Express
    // INTERNAL spans. Actual application configuration is never changed.
    if (dependencies) Object.assign(env,{ MONITORING_TEST_DEPENDENCIES:'1', OTEL_NODE_ENABLED_INSTRUMENTATIONS:'http' });
    if (mysql) Object.assign(env, { MONITORING_TEST_MYSQL_PATH: appRequire.resolve('mysql2'), OTEL_NODE_ENABLED_INSTRUMENTATIONS: 'http,mysql2' });
    if (mysql && withExpress) env.OTEL_NODE_ENABLED_INSTRUMENTATIONS = 'http,express,mysql2';
    if (mysql && success) env.MONITORING_TEST_MYSQL_SUCCESS = '1';
    if (process.argv.includes('--frontend-setup')) {
      const { otelEnvironment } = await import(pathToFileURL(path.join(__dirname, '../../to-monitoring/src/lib/otelSetup.js')).href);
      Object.assign(env, otelEnvironment({ name: 'local-monitoring-test', integration: mysql ? 'mysql2' : 'http', endpoint: f.root + '/otlp/v1/traces', secret }));
    }
    if(process.argv.includes('--default-detectors')) delete env.OTEL_NODE_RESOURCE_DETECTORS;
    child=spawn(process.execPath,['--require',register,path.join(__dirname,'monitoring-node-probe-app.cjs')],{cwd:path.join(__dirname,'..'),env,windowsHide:true,stdio:['ignore','pipe','pipe']});
    child.stderr.resume();
    const port=await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('Isolated instrumented app startup timed out')),30000);
      let output='';
      child.stdout.on('data',chunk=>{output+=String(chunk);const match=output.match(/Probe listening port=(\d+)/);if(match){clearTimeout(timer);resolve(Number(match[1]));}});
      child.once('error',()=>{clearTimeout(timer);reject(new Error('Isolated child could not start'));});
      child.once('exit',code=>{clearTimeout(timer);reject(new Error(`Isolated child exited (${code})`));});
    });
    const response=await fetch(`http://127.0.0.1:${port}/`);await response.arrayBuffer();
    let failureStatus;
    if (success) { const failed = await fetch(`http://127.0.0.1:${port}/failure`); failureStatus = failed.status; await failed.arrayBuffer(); }
    const deadline=Date.now()+10000;
    while(f.supabase.rows.monitoring_spans.length < (success ? 5 : dependencies || mysql ? 3 : 1) && Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,100));
    const spans=f.supabase.rows.monitoring_spans;
    function reachesServer(client) {
      const server = spans.find(s => s.span_kind === 'SERVER' && s.trace_id === client.trace_id);
      if (!server) return false;
      let parent = client.parent_span_id;
      const seen = new Set();
      while (parent && !seen.has(parent)) {
        if (parent === server.span_id) return true;
        seen.add(parent);
        parent = exported.find(s => s.trace === client.trace_id && s.id === parent)?.parent;
      }
      return false;
    }
    const correlated = spans.some(client => client.span_kind === 'CLIENT' && reachesServer(client));
    const safe = !JSON.stringify(spans).includes('DO_NOT_STORE');
    if (mysql) {
      const db = spans.filter(s => s.db_system === 'mysql');
      const startup = db.filter(s => !s.parent_span_id);
      const request = db.filter(s => spans.some(server => server.span_kind === 'SERVER' && server.trace_id === s.trace_id));
      const direct = request.filter(s => spans.some(server => server.span_id === s.parent_span_id));
      const successful = request.filter(s => !s.span_error);
      const failed = request.filter(s => s.span_error && spans.some(server => server.trace_id === s.trace_id && server.http_status === 500));
      console.log(JSON.stringify({ mysqlStartupRoots: startup.length, mysqlRequestChildren: request.length,
        directServerParents: direct.length, omittedInternalParents: request.length - direct.length,
        successfulMysqlRequestSpans: successful.length, failedMysqlRequestSpans: failed.length, failureHttpStatus: failureStatus,
        safe, productionRequests: 0, realDatabaseConnections: 0 }));
      if (startup.length !== 1 || request.length !== (success ? 2 : 1) || !safe
        || !request.every(reachesServer)
        || success && (successful.length !== 1 || failed.length !== 1 || response.status !== 200 || failureStatus !== 500)) process.exitCode = 1;
    }
    console.log(JSON.stringify({ exportedServerSpans: exported.filter(s => s.kind === 2).length,
      exportedClientSpans: exported.filter(s => s.kind === 3).length,
      filteredInternalSpans: exported.filter(s => s.kind === 1).length,
      receiverStatuses: [...new Set(receipts.map(r => r.status))], receiverStoredSpans: receipts.reduce((n, r) => n + r.stored, 0),
      storage: postgres ? 'disposable-local-PostgreSQL' : 'in-memory-adapter' }));
    console.log(JSON.stringify({node:process.versions.node,express:version('express'),autoInstrumentation:version('@opentelemetry/auto-instrumentations-node'),sdk:version('@opentelemetry/sdk-node'),httpStatus:response.status,storedServerSpans:spans.filter(s=>!s.span_kind||s.span_kind==='SERVER').length,storedClientSpans:spans.filter(s=>s.span_kind==='CLIENT').length,correlated,safe,correctTestProject:spans.length>0&&spans.every(span=>span.project_id===projectId),httpRoute:spans[0]?.http_route||null,productionRequests:0,databaseConnections:0}));
    if(!spans.length || (dependencies || mysql) && (!correlated || !safe) || receipts.some(r => r.status !== 200))process.exitCode=1;
  } finally {child?.kill();await f.close();await postgres?.close();}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
