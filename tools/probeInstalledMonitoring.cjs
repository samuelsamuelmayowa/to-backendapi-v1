'use strict';
const path = require('node:path');
const fs = require('node:fs');
const { createRequire } = require('node:module');
const { createHash } = require('node:crypto');
const { spawn } = require('node:child_process');
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
  const f = await fixture({ advancedTraces: dependencies });
  const projectId='11111111-1111-4111-8111-111111111111';
  const secret='to_live_'+'x'.repeat(43); // Static test credential, never a real key.
  f.supabase.rows.monitoring_projects.push({id:projectId,owner_user_id:'owner-a',name:'Local probe'});
  f.supabase.rows.monitoring_project_keys.push({id:'22222222-2222-4222-8222-222222222222',project_id:projectId,key_hash:createHash('sha256').update(secret).digest('hex'),key_prefix:'to_live_xxxxxxxx',revoked_at:null});
  let child;
  try {
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
    const deadline=Date.now()+10000;
    while(f.supabase.rows.monitoring_spans.length < (dependencies ? 3 : 1) && Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,100));
    const spans=f.supabase.rows.monitoring_spans;
    const correlated = spans.some(client => client.span_kind === 'CLIENT' && spans.some(server => server.span_kind === 'SERVER' && server.span_id === client.parent_span_id && server.trace_id === client.trace_id));
    const safe = !JSON.stringify(spans).includes('DO_NOT_STORE');
    console.log(JSON.stringify({node:process.versions.node,express:version('express'),autoInstrumentation:version('@opentelemetry/auto-instrumentations-node'),sdk:version('@opentelemetry/sdk-node'),httpStatus:response.status,storedServerSpans:spans.filter(s=>!s.span_kind||s.span_kind==='SERVER').length,storedClientSpans:spans.filter(s=>s.span_kind==='CLIENT').length,correlated,safe,correctTestProject:spans.length>0&&spans.every(span=>span.project_id===projectId),httpRoute:spans[0]?.http_route||null,productionRequests:0,databaseConnections:0}));
    if(!spans.length || dependencies && (!correlated || !safe))process.exitCode=1;
  } finally {child?.kill();await f.close();}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
