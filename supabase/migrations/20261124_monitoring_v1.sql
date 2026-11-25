-- Fresh Monitoring schema only. Production has none of these four tables.
-- Apply ONCE, then 20261125_monitoring_ingestion.sql, after isolated testing.
-- Pre-existing table names fail closed rather than silently accepting schema drift.
-- No shared extensions, default privileges, schemas or Analytics tables are changed.
begin;
set local search_path = '';
set local lock_timeout = '5s';
set local statement_timeout = '60s';

create table public.monitoring_projects (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  owner_user_id text not null check (char_length(owner_user_id) between 1 and 128
    and owner_user_id = btrim(owner_user_id) and owner_user_id !~ '[[:cntrl:]]'),
  name text not null check (char_length(name) between 1 and 80 and char_length(btrim(name)) > 0),
  runtime text not null default 'nodejs' check (runtime = 'nodejs'),
  environment text not null default 'development' check (environment in ('development','staging','production')),
  created_at timestamptz not null default pg_catalog.clock_timestamp()
);
create index monitoring_projects_owner_idx on public.monitoring_projects(owner_user_id,created_at desc);

create table public.monitoring_project_keys (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  project_id uuid not null references public.monitoring_projects(id) on delete cascade,
  key_hash text not null unique check (key_hash ~ '^[0-9a-f]{64}$'),
  key_prefix text not null check (key_prefix ~ '^to_live_[A-Za-z0-9_-]{8}$'),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
create index monitoring_project_keys_project_idx on public.monitoring_project_keys(project_id,created_at desc);

-- Only approved HTTP server span fields. No arbitrary attributes, raw paths,
-- headers, request bodies, IP addresses, credentials or account data.
create table public.monitoring_spans (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  project_id uuid not null references public.monitoring_projects(id) on delete cascade,
  received_at timestamptz not null default pg_catalog.clock_timestamp(),
  started_at timestamptz not null check (pg_catalog.isfinite(started_at)),
  service_name text not null check (char_length(service_name) between 1 and 100 and char_length(btrim(service_name)) > 0),
  trace_id text not null check (trace_id ~ '^[0-9a-f]{32}$' and trace_id <> repeat('0',32)),
  span_id text not null check (span_id ~ '^[0-9a-f]{16}$' and span_id <> repeat('0',16)),
  http_method text not null check (http_method in ('GET','POST','PUT','PATCH','DELETE','HEAD','OPTIONS','TRACE','CONNECT')),
  http_route text check (http_route is null or (char_length(http_route) between 1 and 180
    and left(http_route,1) = '/' and http_route !~ '[?#[:cntrl:]]')),
  http_status integer check (http_status is null or http_status between 100 and 599),
  duration_ms numeric(15,3) not null check (duration_ms between 0 and 86400000),
  span_error boolean not null default false,
  unique(project_id,trace_id,span_id)
);
create index monitoring_spans_project_time_idx on public.monitoring_spans(project_id,received_at desc);

create table public.monitoring_ingest_buckets (
  project_id uuid not null references public.monitoring_projects(id) on delete cascade,
  bucket_start timestamptz not null check (pg_catalog.isfinite(bucket_start) and extract(second from bucket_start)=0),
  span_count integer not null check (span_count between 1 and 600),
  primary key(project_id,bucket_start)
);

-- Deny direct browser access. Analytics account IDs are not Supabase auth.uid().
-- Express verifies ownership with existing signed sessions; the service role is
-- trusted server code, not a per-user database role. Team access is not enabled.
alter table public.monitoring_projects enable row level security;
alter table public.monitoring_project_keys enable row level security;
alter table public.monitoring_spans enable row level security;
alter table public.monitoring_ingest_buckets enable row level security;

-- Strip shared default grants on THESE NEW TABLES only, including custom roles.
-- No ALTER DEFAULT PRIVILEGES or shared-schema GRANT/REVOKE is performed.
do $$
declare v_grant record;
begin
  for v_grant in
    select distinct c.relname,a.grantee,r.rolname
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid=c.relnamespace
    cross join lateral pg_catalog.aclexplode(coalesce(c.relacl,pg_catalog.acldefault('r',c.relowner))) a
    left join pg_catalog.pg_roles r on r.oid=a.grantee
    where n.nspname='public' and c.relname in
      ('monitoring_projects','monitoring_project_keys','monitoring_spans','monitoring_ingest_buckets')
      and a.grantee<>c.relowner
  loop
    execute pg_catalog.format('revoke all on table public.%I from %s',v_grant.relname,
      case when v_grant.grantee=0 then 'PUBLIC' else pg_catalog.quote_ident(v_grant.rolname) end);
  end loop;
end;
$$;
revoke all on public.monitoring_projects,public.monitoring_project_keys,
  public.monitoring_spans,public.monitoring_ingest_buckets from public,anon,authenticated,service_role;
grant select on public.monitoring_projects,public.monitoring_project_keys,
  public.monitoring_spans,public.monitoring_ingest_buckets to service_role;
grant insert(owner_user_id,name,runtime,environment) on public.monitoring_projects to service_role;
grant update(revoked_at) on public.monitoring_project_keys to service_role;

-- Key creation, ingestion and pruning are RPC-only, defined in migration 2.
-- The unused standalone quota RPC is deliberately not created.
commit;
