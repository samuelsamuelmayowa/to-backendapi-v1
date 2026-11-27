'use strict';
// Test-only SQL adapter, not a Supabase/PostgREST stack. No URL or .env input.
const fs = require('node:fs/promises');
const path = require('node:path');
const net = require('node:net');
const { randomBytes } = require('node:crypto');
const { Client } = require('pg');

async function createProbeStorage() {
  const { default: EmbeddedPostgres } = await import('embedded-postgres');
  const socket = net.createServer();
  await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  const dataRoot = path.join(__dirname, '.data');
  await fs.mkdir(dataRoot, { recursive: true });
  const databaseDir = await fs.mkdtemp(path.join(dataRoot, 'exporter-'));
  const password = randomBytes(24).toString('hex');
  const database = new EmbeddedPostgres({ databaseDir, user: 'postgres', password, port,
    persistent: true, initdbFlags: ['--encoding=UTF8', '--no-locale'],
    postgresFlags: ['-h', '127.0.0.1'], onLog() {}, onError() {} });
  let started = false, admin, service;
  async function close() {
    await Promise.allSettled([admin?.end(), service?.end()]);
    if (started) await database.stop();
  }
  try {
    await database.initialise(); await database.start(); started = true;
    const config = { host: '127.0.0.1', port, user: 'postgres', password, database: 'postgres', connectionTimeoutMillis: 5000 };
    admin = new Client(config); await admin.connect();
    await admin.query('create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls; grant usage on schema public to service_role;');
    for (const name of ['20261124_monitoring_v1.sql', '20261125_monitoring_ingestion.sql', '20261126_monitoring_dependencies.sql']) {
      await admin.query(await fs.readFile(path.join(__dirname, '../../supabase/migrations', name), 'utf8'));
    }
    service = new Client(config); await service.connect(); await service.query('set role service_role');
    const rows = { monitoring_projects: [], monitoring_project_keys: [], monitoring_spans: [] };
    const supabase = { rows,
      from(table) {
        if (table !== 'monitoring_project_keys') throw new Error('Probe adapter supports ingestion key reads only');
        let keyHash;
        return { select() { return this; }, eq(key, value) { if (key !== 'key_hash') throw new Error('Unexpected test key filter'); keyHash = value; return this; },
          is(key, value) { if (key !== 'revoked_at' || value !== null) throw new Error('Unexpected test revocation filter'); return this; },
          async maybeSingle() { return { data: (await service.query('select id,project_id from public.monitoring_project_keys where key_hash=$1 and revoked_at is null', [keyHash])).rows[0] || null, error: null }; } };
      },
      async rpc(name, args) {
        if (name !== 'monitoring_ingest_spans_v2') throw new Error('Unexpected test RPC');
        const data = (await service.query('select public.monitoring_ingest_spans_v2($1,$2::jsonb) result', [args.p_key_hash, JSON.stringify(args.p_spans)])).rows[0].result;
        // Verify persistence by reading rows back from PostgreSQL, not RPC input.
        rows.monitoring_spans = (await service.query('select * from public.monitoring_spans')).rows;
        return { data, error: null };
      },
    };
    return { supabase, close,
      async seed(input) {
        const project = input.monitoring_projects[0], key = input.monitoring_project_keys[0];
        // Admin seeds the disposable fixture. Receiver runs with unchanged
        // service_role grants; do not broaden production-style permissions.
        await admin.query("insert into public.monitoring_projects(id,owner_user_id,name) values($1,$2,$3)", [project.id, project.owner_user_id, project.name]);
        await admin.query('insert into public.monitoring_project_keys(id,project_id,key_hash,key_prefix) values($1,$2,$3,$4)', [key.id, key.project_id, key.key_hash, key.key_prefix]);
      } };
  } catch {
    await close();
    throw new Error('Disposable local PostgreSQL setup failed (details suppressed)');
  }
}
module.exports = { createProbeStorage };
