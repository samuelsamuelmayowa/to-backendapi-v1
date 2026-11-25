'use strict';
// Never loads .env or accepts a remote URL. A new localhost PostgreSQL cluster is
// created for each run. Supabase roles are modeled; this is NOT a Supabase stack.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const net = require('node:net');
const { randomBytes } = require('node:crypto');
const { Client } = require('pg');
const { startMonitoringRetention } = require('../../routes/monitoring');
const root = path.resolve(__dirname, '../..');
const migrationFiles = ['20261124_monitoring_v1.sql', '20261125_monitoring_ingestion.sql'];
const tables = ['monitoring_projects','monitoring_project_keys','monitoring_spans','monitoring_ingest_buckets'];
const functions = ['monitoring_create_project_key(uuid,text,text,text)','monitoring_ingest_spans(text,jsonb)','monitoring_prune_expired()'];
const hash = () => randomBytes(32).toString('hex');
const span = (overrides = {}) => ({ started_at: new Date().toISOString(), service_name: 'shopping-api',
  trace_id: randomBytes(16).toString('hex'), span_id: randomBytes(8).toString('hex'),
  http_method: 'GET', http_route: '/products/:id', http_status: 200, duration_ms: 12.5, span_error: false, ...overrides });

async function freePort() {
  const server = net.createServer();
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

test('both Monitoring migrations on a disposable real PostgreSQL database', { timeout: 240000 }, async t => {
  const { default: EmbeddedPostgres } = await import('embedded-postgres');
  const port = await freePort();
  const password = randomBytes(24).toString('hex');
  const dataRoot = path.join(__dirname, '.data');
  await fs.mkdir(dataRoot, { recursive: true });
  const databaseDir = await fs.mkdtemp(path.join(dataRoot, 'migration-'));
  const database = new EmbeddedPostgres({ databaseDir, user: 'postgres', password, port,
    persistent: true, initdbFlags: ['--encoding=UTF8','--no-locale'],
    postgresFlags: ['-h','127.0.0.1'], onLog() {}, onError() {} });
  let started = false;
  const clients = new Set();
  // Keep the generated data directory for inspection; never recursively delete
  // a caller-supplied path. The cluster is stopped even when an assertion fails.
  t.after(async () => {
    await Promise.allSettled([...clients].map(client => client.end()));
    if (started) await database.stop();
  });
  await database.initialise();
  await database.start(); started = true;
  const config = { host: '127.0.0.1', port, user: 'postgres', password, database: 'postgres',
    application_name: 'monitoring-migration-tests', connectionTimeoutMillis: 5000,
    options: '-c statement_timeout=15000 -c lock_timeout=10000' };
  async function connect(role) {
    const client = new Client(config); clients.add(client); await client.connect();
    if (role) await client.query(`set role ${role}`); // Only hardcoded test roles.
    return client;
  }
  async function close(client) { clients.delete(client); await client.end(); }
  const admin = await connect();
  const version = (await admin.query('show server_version')).rows[0].server_version;
  t.diagnostic(`PostgreSQL ${version}; localhost:${port}; fresh disposable cluster; no production connection loaded`);
  await admin.query(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create role monitoring_test_untrusted nologin;
    grant usage on schema public to anon,authenticated,service_role,monitoring_test_untrusted;
    alter default privileges in schema public grant all on tables to public,anon,authenticated,service_role,monitoring_test_untrusted;
    alter default privileges in schema public grant execute on functions to public,anon,authenticated,monitoring_test_untrusted;
    create table public.analytics_users_canary(id integer primary key, marker text not null);
    create table public.students_canary(id integer primary key, marker text not null);
    create table public.quiz_canary(id integer primary key, marker text not null);
    create table public.splunk_events_canary(id integer primary key, marker text not null);
    insert into public.analytics_users_canary values(1,'analytics-unchanged');
    insert into public.students_canary values(1,'students-unchanged');
    insert into public.quiz_canary values(1,'quiz-unchanged');
    insert into public.splunk_events_canary values(1,'splunk-unchanged');
  `);
  const sql = await Promise.all(migrationFiles.map(name => fs.readFile(path.join(root,'supabase/migrations',name),'utf8')));
  const service = await connect('service_role');
  const rpc = async (client, keyHash, rows) => (await client.query('select public.monitoring_ingest_spans($1,$2::jsonb) result',[keyHash,JSON.stringify(rows)])).rows[0].result;
  async function project(owner = 'verified-owner-a') {
    return (await service.query(`insert into public.monitoring_projects(owner_user_id,name,runtime,environment)
      values($1,'Shopping API','nodejs','development') returning id`,[owner])).rows[0].id;
  }
  async function key(projectId, owner = 'verified-owner-a', client = service) {
    const secretHash = hash();
    const result = (await client.query('select public.monitoring_create_project_key($1,$2,$3,$4) result',
      [projectId,owner,secretHash,'to_live_aBcdEf12'])).rows[0].result;
    return { ...result, hash: secretHash };
  }
  async function snapshot() {
    return {
      defaults: (await admin.query('select defaclrole,defaclnamespace,defaclobjtype,defaclacl::text from pg_catalog.pg_default_acl order by oid')).rows,
      extensions: (await admin.query('select extname,extversion from pg_catalog.pg_extension order by extname')).rows,
      canary: (await admin.query(`select c.relname,c.relrowsecurity,c.relacl::text,a.attname,a.atttypid,a.attnotnull
        from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
        join pg_catalog.pg_attribute a on a.attrelid=c.oid and a.attnum>0
        where n.nspname='public' and c.relname like '%_canary' order by c.relname,a.attnum`)).rows,
      data: (await admin.query(`select 'analytics' source,* from public.analytics_users_canary union all
        select 'students',* from public.students_canary union all select 'quiz',* from public.quiz_canary union all
        select 'splunk',* from public.splunk_events_canary order by source`)).rows,
    };
  }
  const original = await snapshot();

  await t.test('baseline failure rolls back every new table and leaves shared objects unchanged', async () => {
    await assert.rejects(admin.query(sql[0].replace(/commit;\s*$/i,'select 1/0; commit;')), e => e.code==='22012');
    await admin.query('rollback');
    for (const name of tables) assert.equal((await admin.query('select pg_catalog.to_regclass($1) object',['public.'+name])).rows[0].object,null);
    assert.deepEqual(await snapshot(),original);
    await admin.query(sql[0]);
  });

  await t.test('ingestion migration failure rolls back functions, column, indexes and quota removal', async () => {
    // Model a legacy install solely to verify safe removal and transactional rollback.
    await admin.query(`create function public.monitoring_claim_ingest_quota(uuid,integer,integer)
      returns boolean language sql as 'select false'`);
    await assert.rejects(admin.query(sql[1].replace(/commit;\s*$/i,'select 1/0; commit;')), e => e.code==='22012');
    await admin.query('rollback');
    for (const name of functions) assert.equal((await admin.query('select pg_catalog.to_regprocedure($1) object',['public.'+name])).rows[0].object,null);
    assert.equal((await admin.query(`select count(*)::int n from information_schema.columns where table_schema='public'
      and table_name='monitoring_projects' and column_name='last_received_at'`)).rows[0].n,0);
    assert.notEqual((await admin.query("select pg_catalog.to_regprocedure('public.monitoring_claim_ingest_quota(uuid,integer,integer)') object")).rows[0].object,null);
    await admin.query('create view public.monitoring_quota_test_dependency as select public.monitoring_claim_ingest_quota(null,1,600) claimed');
    await assert.rejects(admin.query(sql[1]),e => e.code==='2BP01');
    await admin.query('rollback');
    assert.notEqual((await admin.query("select pg_catalog.to_regclass('public.monitoring_quota_test_dependency') object")).rows[0].object,null);
    await admin.query('drop view public.monitoring_quota_test_dependency');
    await admin.query(sql[1]);
    assert.equal((await admin.query("select pg_catalog.to_regprocedure('public.monitoring_claim_ingest_quota(uuid,integer,integer)') object")).rows[0].object,null);
    assert.deepEqual(await snapshot(),original);
  });

  await t.test('all definer paths, RLS, default-grant cleanup and intended EXECUTE permissions', async () => {
    for (const name of functions) {
      const proc = (await admin.query('select prosecdef,proconfig from pg_catalog.pg_proc where oid=$1::regprocedure',['public.'+name])).rows[0];
      assert.equal(proc.prosecdef,true); assert.ok(proc.proconfig.includes('search_path=""'));
      for (const role of ['anon','authenticated','monitoring_test_untrusted']) {
        assert.equal((await admin.query('select pg_catalog.has_function_privilege($1,$2,\'EXECUTE\') allowed',[role,'public.'+name])).rows[0].allowed,false);
      }
      assert.equal((await admin.query('select pg_catalog.has_function_privilege(\'service_role\',$1,\'EXECUTE\') allowed',['public.'+name])).rows[0].allowed,true);
    }
    for (const name of tables) {
      assert.equal((await admin.query('select relrowsecurity from pg_catalog.pg_class where oid=$1::regclass',['public.'+name])).rows[0].relrowsecurity,true);
      for (const role of ['anon','authenticated','monitoring_test_untrusted']) {
        assert.equal((await admin.query('select pg_catalog.has_any_column_privilege($1,$2,\'SELECT,INSERT,UPDATE\') allowed',[role,'public.'+name])).rows[0].allowed,false);
      }
    }
    for (const role of ['anon','authenticated','monitoring_test_untrusted']) {
      const client = await connect(role);
      await assert.rejects(client.query('select * from public.monitoring_projects'),e => e.code==='42501');
      await assert.rejects(client.query('select public.monitoring_prune_expired()'),e => e.code==='42501');
      await assert.rejects(client.query('select public.monitoring_create_project_key(null,null,null,null)'),e => e.code==='42501');
      await assert.rejects(client.query("select public.monitoring_ingest_spans(null,'[]')"),e => e.code==='42501');
      await close(client);
    }
    await assert.rejects(service.query("insert into public.monitoring_spans(project_id) values(null)"),e => e.code==='42501');
    await assert.rejects(service.query("insert into public.monitoring_project_keys(project_id,key_hash,key_prefix) values(null,null,null)"),e => e.code==='42501');
    await assert.rejects(service.query('delete from public.monitoring_projects'),e => e.code==='42501');
  });

  await t.test('ownership, three-key cap under contention, direct-write denial and RLS isolation', async () => {
    const id = await project();
    assert.equal((await key(id,'other-owner')).error,'not_found');
    assert.equal((await key(id,null)).error,'not_found');
    const workers = await Promise.all(Array.from({length:10},() => connect('service_role')));
    try {
      const results = await Promise.all(workers.map(client => key(id,'verified-owner-a',client)));
      assert.equal(results.filter(result => result.id).length,3);
      assert.equal(results.filter(result => result.error==='key_limit').length,7);
    } finally { await Promise.all(workers.map(close)); }
    await assert.rejects(service.query("update public.monitoring_project_keys set key_hash=$1 where project_id=$2",[hash(),id]),e => e.code==='42501');
    await admin.query('begin');
    try {
      await admin.query('grant select on public.monitoring_projects to anon,authenticated');
      for (const role of ['anon','authenticated']) {
        await admin.query(`set local role ${role}`);
        assert.equal((await admin.query('select * from public.monitoring_projects')).rowCount,0);
        await admin.query('reset role');
      }
      await admin.query('grant insert(owner_user_id,name) on public.monitoring_projects to anon');
      await admin.query('set local role anon');
      await assert.rejects(admin.query("insert into public.monitoring_projects(owner_user_id,name) values('forged','Unauthorized')"),e => e.code==='42501');
    } finally { await admin.query('rollback'); }
  });

  await t.test('qualified objects resist caller search-path and temporary-table hijacking', async () => {
    await admin.query(`create function public.clock_timestamp() returns timestamptz language sql as
      'select ''1900-01-01 UTC''::timestamptz';
      create function public.jsonb_build_object(text,text) returns jsonb language sql as 'select ''{"hijacked":true}''::jsonb';
      create function public.pg_try_advisory_xact_lock(bigint) returns boolean language sql as 'select false'`);
    const client = await connect();
    try {
      await client.query(`set search_path=public,pg_catalog;
        create temporary table monitoring_projects(id uuid,owner_user_id text);
        create temporary table monitoring_project_keys(id uuid,project_id uuid,key_hash text,revoked_at timestamptz);
        set role service_role`);
      const id = await project(); const created = await key(id,'verified-owner-a',client);
      assert.ok(created.id); assert.equal(created.hijacked,undefined);
      assert.equal((await rpc(client,created.hash,[span()])).stored,1);
      const last = (await service.query('select last_received_at from public.monitoring_projects where id=$1',[id])).rows[0].last_received_at;
      assert.ok(last.getFullYear()>2020);
      assert.equal((await client.query('select public.monitoring_prune_expired() result')).rows[0].result.busy,undefined);
    } finally {
      await close(client);
      await admin.query('drop function public.clock_timestamp();drop function public.jsonb_build_object(text,text);drop function public.pg_try_advisory_xact_lock(bigint)');
    }
  });

  await t.test('valid writes are key-scoped, duplicates/empty batches do not fake connection', async () => {
    const id = await project(), other = await project('owner-b'), k = await key(id);
    assert.equal((await rpc(service,hash(),[span()])).error,'invalid_key');
    assert.equal((await rpc(service,k.hash,[])).stored,0);
    assert.equal((await service.query('select last_received_at from public.monitoring_projects where id=$1',[id])).rows[0].last_received_at,null);
    const rows = [span({ project_id: other, ignored_secret: 'DO_NOT_STORE' })];
    assert.equal((await rpc(service,k.hash,rows)).stored,1);
    const before = (await service.query('select last_received_at from public.monitoring_projects where id=$1',[id])).rows[0].last_received_at;
    assert.equal((await rpc(service,k.hash,rows)).stored,0);
    assert.deepEqual((await service.query('select last_received_at from public.monitoring_projects where id=$1',[id])).rows[0].last_received_at,before);
    assert.equal((await service.query('select count(*)::int n from public.monitoring_spans where project_id=$1',[other])).rows[0].n,0);
    assert.ok(!JSON.stringify((await service.query('select * from public.monitoring_spans where project_id=$1',[id])).rows).includes('DO_NOT_STORE'));
  });

  await t.test('constraints and malformed RPC payloads roll back the complete batch', async () => {
    const id = await project(), k = await key(id);
    for (const [body, code] of [[null,'22023'],[{},'22023'],[Array.from({length:101},() => span()),'22023'],
      [[span({ ignored: 'x'.repeat(270000) })],'22023'],[[span(),span({trace_id:'0'.repeat(32)})],'23514'],
      [[span({http_method:'INVALID'})],'23514'],[[span({http_route:'/private?token=secret'})],'23514'],
      [[span({http_route:'/private#fragment'})],'23514'],[[span({service_name:''})],'23514'],
      [[span({duration_ms:-1})],'23514'],[[span({duration_ms:86400001})],'23514'],
      [[span({http_status:999})],'23514'],[[span({started_at:'infinity'})],'23514']]) {
      await assert.rejects(rpc(service,k.hash,body),e => e.code===code);
    }
    assert.equal((await service.query('select count(*)::int n from public.monitoring_spans where project_id=$1',[id])).rows[0].n,0);
    assert.equal((await service.query('select last_received_at from public.monitoring_projects where id=$1',[id])).rows[0].last_received_at,null);
    for (const [owner,name] of [['','valid'],['  ','valid'],['owner','  ']]) {
      await assert.rejects(service.query("insert into public.monitoring_projects(owner_user_id,name) values($1,$2)",[owner,name]),e => e.code==='23514');
    }
    await assert.rejects(admin.query("insert into public.monitoring_project_keys(project_id,key_hash,key_prefix) values(pg_catalog.gen_random_uuid(),$1,'to_live_aBcdEf12')",[hash()]),e => e.code==='23503');
  });

  await t.test('concurrent ingestion through multiple keys cannot exceed the one project quota', async () => {
    const id = await project(), keys = [await key(id),await key(id)];
    const second = Number((await admin.query("select extract(second from pg_catalog.clock_timestamp()) as seconds_into_minute")).rows[0].seconds_into_minute);
    // Give every contender at least 30 seconds in the same real quota minute.
    if (second>30) await new Promise(resolve => setTimeout(resolve,(60-second)*1000+50));
    // Seed adjacent minutes too, so a real wall-clock minute boundary cannot
    // make this contention test flaky. Each minute starts with 590 claimed spans.
    await admin.query(`insert into public.monitoring_ingest_buckets(project_id,bucket_start,span_count)
      select $1,pg_catalog.date_trunc('minute',pg_catalog.clock_timestamp())+minutes.n*interval '1 minute',590
      from generate_series(-1,1) as minutes(n)`,[id]);
    const workers = await Promise.all(Array.from({length:12},() => connect('service_role')));
    try {
      const results = await Promise.all(workers.map((client,i) => rpc(client,keys[i%2].hash,Array.from({length:10},() => span()))));
      assert.equal(results.filter(result => result.stored===10).length,1);
      assert.equal(results.filter(result => result.error==='quota_exceeded').length,11);
    } finally { await Promise.all(workers.map(close)); }
    assert.equal((await service.query('select count(*)::int n from public.monitoring_spans where project_id=$1',[id])).rows[0].n,10);
    const buckets = (await service.query('select span_count from public.monitoring_ingest_buckets where project_id=$1',[id])).rows;
    assert.equal(buckets.filter(row => row.span_count===600).length,1);
    assert.ok(buckets.every(row => row.span_count<=600));
    const before = (await service.query(`select p.last_received_at,k.last_used_at,
      (select sum(span_count)::int from public.monitoring_ingest_buckets where project_id=p.id) quota
      from public.monitoring_projects p join public.monitoring_project_keys k on k.project_id=p.id where p.id=$1 order by k.id`,[id])).rows;
    assert.equal((await rpc(service,keys[0].hash,[span()])).error,'quota_exceeded');
    assert.deepEqual((await service.query(`select p.last_received_at,k.last_used_at,
      (select sum(span_count)::int from public.monitoring_ingest_buckets where project_id=p.id) quota
      from public.monitoring_projects p join public.monitoring_project_keys k on k.project_id=p.id where p.id=$1 order by k.id`,[id])).rows,before);
    assert.equal((await service.query('select count(*)::int n from public.monitoring_spans where project_id=$1',[id])).rows[0].n,10);
  });

  await t.test('concurrent duplicate spans are stored and charged only once', async () => {
    const id = await project(), keys = [await key(id),await key(id)], rows = [span()];
    const workers = await Promise.all(Array.from({length:8},() => connect('service_role')));
    try {
      const results = await Promise.all(workers.map((client,i) => rpc(client,keys[i%2].hash,rows)));
      assert.equal(results.reduce((n,result) => n+result.stored,0),1);
    } finally { await Promise.all(workers.map(close)); }
    assert.equal((await service.query('select sum(span_count)::int n from public.monitoring_ingest_buckets where project_id=$1',[id])).rows[0].n,1);
  });

  async function waitForLock(pid) {
    const end = Date.now()+4000;
    while (Date.now()<end) {
      if ((await admin.query("select wait_event_type from pg_catalog.pg_stat_activity where pid=$1",[pid])).rows[0]?.wait_event_type==='Lock') return;
      await new Promise(resolve => setTimeout(resolve,25));
    }
    assert.fail('Expected transaction to wait on the competing row lock');
  }

  await t.test('revocation committed before waiting ingestion prevents every write', async () => {
    const id = await project(), k = await key(id), revoker = await connect('service_role'), sender = await connect('service_role');
    try {
      await revoker.query('begin');
      await revoker.query('update public.monitoring_project_keys set revoked_at=pg_catalog.clock_timestamp() where id=$1',[k.id]);
      const pid = (await sender.query('select pg_catalog.pg_backend_pid() pid')).rows[0].pid;
      const pending = rpc(sender,k.hash,[span()]);
      await waitForLock(pid);
      await revoker.query('commit');
      assert.equal((await pending).error,'invalid_key');
      assert.equal((await service.query('select count(*)::int n from public.monitoring_spans where project_id=$1',[id])).rows[0].n,0);
    } finally { await revoker.query('rollback'); await close(revoker); await close(sender); }
  });

  await t.test('ingestion already holding the key commits before revocation; subsequent writes fail', async () => {
    const id = await project(), k = await key(id), sender = await connect('service_role'), revoker = await connect('service_role');
    try {
      await sender.query('begin'); assert.equal((await rpc(sender,k.hash,[span()])).stored,1);
      const pid = (await revoker.query('select pg_catalog.pg_backend_pid() pid')).rows[0].pid;
      const revoke = revoker.query('update public.monitoring_project_keys set revoked_at=pg_catalog.clock_timestamp() where id=$1',[k.id]);
      await waitForLock(pid); await sender.query('commit'); await revoke;
      assert.equal((await rpc(service,k.hash,[span()])).error,'invalid_key');
    } finally { await sender.query('rollback'); await close(sender); await close(revoker); }
  });

  await t.test('caller transaction rollback removes span, bucket, key-use and connection updates', async () => {
    const id = await project(), k = await key(id), sender = await connect('service_role');
    try {
      await sender.query('begin'); assert.equal((await rpc(sender,k.hash,[span()])).stored,1); await sender.query('rollback');
      assert.equal((await service.query('select count(*)::int n from public.monitoring_spans where project_id=$1',[id])).rows[0].n,0);
      assert.equal((await service.query('select count(*)::int n from public.monitoring_ingest_buckets where project_id=$1',[id])).rows[0].n,0);
      assert.equal((await service.query('select last_received_at from public.monitoring_projects where id=$1',[id])).rows[0].last_received_at,null);
      assert.equal((await service.query('select last_used_at from public.monitoring_project_keys where id=$1',[k.id])).rows[0].last_used_at,null);
    } finally { await close(sender); }
  });

  await t.test('retention scheduler invokes real pruning RPC, honors advisory lock and batch limits', async () => {
    const id = await project(), k = await key(id); await rpc(service,k.hash,[span()]);
    await admin.query(`insert into public.monitoring_spans(project_id,received_at,started_at,service_name,trace_id,span_id,http_method,duration_ms)
      select $1,pg_catalog.clock_timestamp()-interval '8 days',pg_catalog.clock_timestamp()-interval '8 days',
      'old-spans',pg_catalog.md5(n::text),left(pg_catalog.md5(n::text),16),'GET',1 from generate_series(1,10001) n`,[id]);
    await admin.query(`insert into public.monitoring_ingest_buckets(project_id,bucket_start,span_count)
      values($1,pg_catalog.date_trunc('minute',pg_catalog.clock_timestamp())-interval '3 hours',1)`,[id]);
    const locker = await connect();
    try {
      await locker.query('begin;select pg_catalog.pg_advisory_xact_lock(746620251125::bigint)');
      assert.equal((await service.query('select public.monitoring_prune_expired() result')).rows[0].result.busy,true);
      await locker.query('rollback');
    } finally { await close(locker); }
    let tick, calls = 0, lastResult;
    startMonitoringRetention(() => ({ async rpc(name) {
      calls++; assert.equal(name,'monitoring_prune_expired');
      lastResult=(await service.query('select public.monitoring_prune_expired() result')).rows[0].result;
      return { data: lastResult, error: null };
    } }), { schedule(callback,delay) { assert.equal(delay,60000); tick=callback; return {unref(){}}; }, logger: {warn(){assert.fail('Pruning must succeed');}} });
    await tick(); assert.equal(calls,1); assert.equal(lastResult.spans_deleted,10000); assert.equal(lastResult.buckets_deleted,1);
    await tick(); assert.equal(calls,2); assert.equal(lastResult.spans_deleted,1);
    assert.equal((await service.query('select count(*)::int n from public.monitoring_spans where project_id=$1',[id])).rows[0].n,1);
    assert.notEqual((await service.query('select last_received_at from public.monitoring_projects where id=$1',[id])).rows[0].last_received_at,null);
  });

  await t.test('migration rerun fails closed and shared application schema/data remain unchanged', async () => {
    await assert.rejects(admin.query(sql[0]),e => e.code==='42P07'); await admin.query('rollback');
    await assert.rejects(admin.query(sql[1]),e => e.code==='42701'); await admin.query('rollback');
    assert.deepEqual(await snapshot(),original);
    assert.equal((await admin.query("select count(*)::int n from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=any($1::text[]) and c.relkind='r'",[tables])).rows[0].n,4);
  });
});
