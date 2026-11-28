const { test } = require('node:test');
const assert = require('node:assert/strict');
const { aggregateDatabase } = require('../database-insights.cjs');
const { fixture, register } = require('./helpers/monitoringFixture');
test('linear interpolated percentiles, mean, unknown outcomes and strict slow threshold',()=>{
 const stats=aggregateDatabase([1,2,30].map(duration_ms=>({duration_ms,span_error:duration_ms===30})),2);
 assert.equal(stats.average_ms,11);assert.equal(stats.p50_ms,2);assert.ok(Math.abs(stats.p95_ms-27.2)<1e-10);assert.ok(Math.abs(stats.p99_ms-29.44)<1e-10);
 assert.equal(stats.slow_count,1);assert.equal(stats.unknown_outcome_count,2);assert.equal(stats.recorded_error_rate,1/3);assert.equal(stats.insufficient_data,true);
 const empty=aggregateDatabase([]);assert.equal(empty.p99_ms,null);assert.equal(empty.average_ms,null);assert.equal(empty.recorded_error_rate,null);
 assert.equal(aggregateDatabase([{duration_ms:null}]).duration_sample_size,0);
});
test('authorized project-scoped bounded trends, filters, retention and rollout gate',async t=>{
 process.env.MONITORING_DATABASE_INSIGHTS_ENABLED='true';t.after(()=>delete process.env.MONITORING_DATABASE_INSIGHTS_ENABLED);
 const f=await fixture({advancedTraces:true});t.after(f.close);const {project}=await register(f);
 const row={project_id:project.id,span_kind:'CLIENT',db_system:'mysql',service_name:'api',started_at:new Date().toISOString(),duration_ms:600,span_error:false};
 f.supabase.rows.monitoring_spans.push(row,{...row,project_id:'another-project'},{...row,span_kind:'SERVER'},{...row,started_at:new Date(Date.now()-8*86400000).toISOString()});
 const path=`/api/monitoring/projects/${project.id}/database-insights`;
 assert.equal((await f.request(path,{user:null})).status,401);assert.equal((await f.request(path,{user:'other'})).status,404);
 const result=await(await f.request(path)).json();assert.equal(result.count,1);assert.equal(result.slow_count,1);assert.equal(result.trends.length,1);assert.equal(result.possibly_truncated,false);
 assert.equal((await(await f.request(path+'?system=redis')).json()).count,0);
 assert.equal((await f.request(path+'?hours=999')).status,400);assert.equal((await f.request(path+'?threshold=NaN')).status,400);
 f.supabase.rows.monitoring_spans.push(...Array.from({length:1100},()=>({...row})));
 const capped=await(await f.request(path)).json();assert.equal(capped.count,1000);assert.equal(capped.possibly_truncated,true);
 delete process.env.MONITORING_DATABASE_INSIGHTS_ENABLED;assert.equal((await f.request(path)).status,404);
});
