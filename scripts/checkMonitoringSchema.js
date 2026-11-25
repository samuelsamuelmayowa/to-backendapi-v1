'use strict';
// Read-only preflight. Never applies migrations or returns row data or secrets.
require('dotenv').config({ path: require('path').join(__dirname, '../.env'), quiet: true });
const tables = {
  monitoring_projects: 'id,owner_user_id,name,runtime,environment,created_at,last_received_at',
  monitoring_project_keys: 'id,project_id,key_hash,key_prefix,created_at,last_used_at,revoked_at',
  monitoring_spans: 'id,project_id,received_at,started_at,service_name,trace_id,span_id,http_method,http_route,http_status,duration_ms,span_error',
  monitoring_ingest_buckets: 'project_id,bucket_start,span_count',
  to_monitor_projects: 'id', to_monitor_keys: 'id', to_monitor_spans: 'id',
};
(async () => {
  const supabase = require('../config/supabaseAdmin');
  for (const [name, columns] of Object.entries(tables)) {
    const { error } = await supabase.from(name).select(columns, { head: true }).limit(0).abortSignal(AbortSignal.timeout(8000));
    const status = error ? (error.code || 'connection_error') : 'exists';
    console.log(`${name}: ${status}`);
    if (error && name.startsWith('monitoring_')) process.exitCode = 1;
  }
})().catch(() => { console.error('Schema check failed; verify backend Supabase configuration and connectivity.'); process.exitCode = 1; });
