const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const express = require('express');
const jwt = require('jsonwebtoken');
const { fakeSupabase, payload } = require('./helpers/monitoringFixture');
const monitoring = require('../routes/monitoring');

test('actual api/index.js mounts Monitoring without changing legacy parser, webhook, routes or startup', async t => {
  process.env.JWT_SECRET='bootstrap-test-only-secret';
  process.env.FRONTEND_ORIGINS='https://to-monitoring.vercel.app';
  const filename=path.resolve(__dirname,'../api/index.js');
  const realRequire=createRequire(filename);
  const storage=fakeSupabase();
  let app,server,host,configuredPort,tick,interval,cleared=false,dbConnections=0,realtime=0;
  const timer={unref(){}};
  function testExpress(...args) {
    app=express(...args); const listen=app.listen.bind(app);
    app.listen=(port,bind,callback)=>{ configuredPort=port;host=bind;server=listen(0,'127.0.0.1',callback);return server; };
    return app;
  }
  Object.assign(testExpress,express);
  function legacy(label) {
    const router=express.Router();
    router.get(`/__probe_${label}`,(req,res)=>res.json({legacy:label}));
    router.post(`/__probe_${label}`,(req,res)=>res.json({legacy:label,parsed:Boolean(req.body?.padding)}));
    return router;
  }
  const webhook=express.Router();
  webhook.post('/',express.raw({type:'application/json'}),(req,res)=>res.json({raw:Buffer.isBuffer(req.body)}));
  const overrides={
    express:testExpress, dotenv:{config(){}},
    '../services/database':{connectDatabase:async()=>{dbConnections++;}},
    '../services/splunkTrainingStore':{usesSupabaseTrainingStore:()=>false,initializeSplunkTrainingStore:async()=>{}},
    '../routes/monitoring':{
      monitoringError:monitoring.monitoringError,
      createMonitoringRoutes:()=>monitoring.createMonitoringRoutes({getSupabase:()=>storage}),
      startMonitoringRetention:()=>monitoring.startMonitoringRetention(()=>storage,{schedule(callback,delay){tick=callback;interval=delay;return timer;}}),
    },
    '../services/realtimeMarketDataService':{attachRealtimeMarketData(value){assert.equal(value,server);realtime++;}},
    '../routes/payment.js':{webhookRouter:webhook,checkoutRouter:legacy('payments')},
    '../routes/jobs.js':realRequire('../routes/jobs.js'),
    '../routes/options':{createOptionsRouter:()=>legacy('options')},
    '../middleware/auth':{}, '../model/payment.js':{},
    '@paypal/checkout-server-sdk':{}, stripe:{},cron:{CronJob:class{}},
    openai:{default:class{}},
  };
  const names={'../routes/pages.js':'analytics','../routes/auth.js':'auth','../routes/session.js':'session','../routes/splunkLab.js':'studio','../routes/splunkAlerts':'alerts','../routes/skillLab.js':'skills','../routes/skillLabWorkplace.js':'workplace','../routes/stockQuizzes.js':'quizzes','../routes/dashboard.js':'dashboard','../routes/adminroutes.js':'admin','../routes/file.js':'files','../routes/marketData.js':'markets','../routes/orientationFeedback':'feedback'};
  const sandbox={module:{exports:{}},__dirname:path.dirname(filename),Buffer,console:{log(){},error(){}},
    process:{env:{PORT:'10000',JWT_SECRET:process.env.JWT_SECRET}},
    clearInterval(value){assert.equal(value,timer);cleared=true;},
    require(id){if(Object.hasOwn(overrides,id))return overrides[id];if(names[id])return legacy(names[id]);return realRequire(id);},
  };
  // Providers/legacy handlers are isolated here; their implementations run in
  // the separate regression files. This evaluates the unchanged full entry file.
  vm.runInNewContext(fs.readFileSync(filename,'utf8'),sandbox,{filename});
  let closed=false;
  async function close(){if(closed)return;closed=true;await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});}
  t.after(close);
  if(!server.listening)await new Promise(resolve=>server.once('listening',resolve));
  assert.equal(sandbox.module.exports,app);assert.equal(host,'0.0.0.0');assert.equal(configuredPort,'10000');
  assert.equal(dbConnections,1);assert.equal(realtime,1);assert.equal(interval,60000);
  const base=`http://127.0.0.1:${server.address().port}`;
  const csrf='c'.repeat(43);
  const cookie=`to_session=${jwt.sign({userId:'owner-a'},process.env.JWT_SECRET)}; to_csrf=${csrf}`;
  const headers={Cookie:cookie,'X-CSRF-Token':csrf,'Content-Type':'application/json',Origin:'https://to-monitoring.vercel.app'};
  assert.equal((await fetch(base+'/api/monitoring/projects')).status,401);
  assert.equal((await fetch(base+'/api/monitoring/projects',{method:'POST',headers:{...headers,'X-CSRF-Token':''},body:'{}'})).status,403);
  const created=await fetch(base+'/api/monitoring/projects',{method:'POST',headers,body:JSON.stringify({name:'Shopping API',runtime:'nodejs',environment:'development'})});
  assert.equal(created.status,201);assert.equal(created.headers.get('access-control-allow-origin'),'https://to-monitoring.vercel.app');const {project}=await created.json();
  const keyResponse=await fetch(base+`/api/monitoring/projects/${project.id}/keys`,{method:'POST',headers});
  assert.equal(keyResponse.status,201);const {secret}=await keyResponse.json();
  const body={...payload(),padding:'x'.repeat(130000)};
  const ingested=await fetch(base+'/otlp/v1/traces',{method:'POST',headers:{'Content-Type':'application/json','x-to-project-key':secret},body:JSON.stringify(body)});
  assert.equal(ingested.status,200,'OTLP >100KB must reach its own 256KB parser');
  const status=await fetch(base+`/api/monitoring/projects/${project.id}/status`,{headers});
  assert.equal((await status.json()).connected,true);
  assert.equal((await fetch(base+'/api/monitoring/projects',{method:'POST',headers,body:JSON.stringify({padding:'x'.repeat(17000)})})).status,413);
  for(const [url,label] of [['/api/__probe_analytics','analytics'],['/api/__probe_quizzes','quizzes'],['/api/__probe_auth','auth'],['/api/splunk-lab/__probe_studio','studio'],['/api/splunk-alerts/__probe_alerts','alerts']]) {
    assert.deepEqual(await (await fetch(base+url)).json(),{legacy:label});
  }
  const studio=await fetch(base+'/api/splunk-lab/__probe_studio',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({padding:'x'.repeat(20000)})});
  assert.equal(studio.status,200);assert.equal((await studio.json()).parsed,true);
  assert.deepEqual(await (await fetch(base+'/api/payment/webhook',{method:'POST',headers:{'Content-Type':'application/json'},body:'{raw signature fixture'})).json(),{raw:true});
  assert.equal((await fetch(base+'/api/jobs?category=invalid-category')).status,400);
  await tick();assert.ok(storage.rpcCalls.includes('monitoring_prune_expired'));
  await close();assert.equal(cleared,true);
});
