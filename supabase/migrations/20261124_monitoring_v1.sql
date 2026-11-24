-- T.O. Monitoring v1: NEW TABLES ONLY. Review before executing in your existing Supabase project.
-- Personal-workspace pilot. No student/public dataset sharing and no company/team permissions yet.
-- This migration does not alter existing T.O. Analytics tables.

create extension if not exists pgcrypto;

create table if not exists public.monitoring_projects (
  id uuid primary key default gen_random_uuid(),
  owner_user_id text not null,
  name text not null check (char_length(name) between 1 and 80),
  runtime text not null default 'nodejs' check (runtime = 'nodejs'),
  environment text not null default 'development'
    check (environment in ('development', 'staging', 'production')),
  created_at timestamptz not null default now()
);
create index if not exists monitoring_projects_owner_idx
  on public.monitoring_projects (owner_user_id, created_at desc);

create table if not exists public.monitoring_project_keys (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.monitoring_projects(id) on delete cascade,
  key_hash text not null unique check (key_hash ~ '^[0-9a-f]{64}$'),
  key_prefix text not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
create index if not exists monitoring_project_keys_project_idx
  on public.monitoring_project_keys (project_id, created_at desc);

-- Deliberately stores a *minimal* subset of server HTTP span attributes.
-- It does NOT store raw request paths, bodies, headers, tokens, IPs, or arbitrary span attributes.
create table if not exists public.monitoring_spans (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.monitoring_projects(id) on delete cascade,
  received_at timestamptz not null default now(),
  started_at timestamptz,
  service_name text not null,
  trace_id text not null check (trace_id ~ '^[0-9a-fA-F]{32}$'),
  span_id text not null check (span_id ~ '^[0-9a-fA-F]{16}$'),
  http_method text,
  http_route text,
  http_status integer check (http_status is null or http_status between 100 and 599),
  duration_ms numeric(15, 3) check (duration_ms is null or duration_ms >= 0),
  span_error boolean not null default false,
  unique (project_id, trace_id, span_id)
);
create index if not exists monitoring_spans_project_time_idx
  on public.monitoring_spans (project_id, received_at desc);

-- Shared-backend protection: atomic small pilot quota per project/minute.
create table if not exists public.monitoring_ingest_buckets (
  project_id uuid not null references public.monitoring_projects(id) on delete cascade,
  bucket_start timestamptz not null,
  span_count integer not null default 0,
  primary key (project_id, bucket_start)
);

-- Enable RLS on ALL new tables. No frontend/anon/user policies: API only, via trusted backend.
alter table public.monitoring_projects enable row level security;
alter table public.monitoring_project_keys enable row level security;
alter table public.monitoring_spans enable row level security;
alter table public.monitoring_ingest_buckets enable row level security;

revoke all on table public.monitoring_projects from anon, authenticated;
revoke all on table public.monitoring_project_keys from anon, authenticated;
revoke all on table public.monitoring_spans from anon, authenticated;
revoke all on table public.monitoring_ingest_buckets from anon, authenticated;
grant select, insert, update, delete on table
  public.monitoring_projects,
  public.monitoring_project_keys,
  public.monitoring_spans,
  public.monitoring_ingest_buckets
  to service_role;

create or replace function public.monitoring_claim_ingest_quota(
  p_project_id uuid,
  p_count integer,
  p_max_per_minute integer
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_count integer;
begin
  if p_count < 1 or p_max_per_minute < 1 or p_max_per_minute > 50000
     or p_count > p_max_per_minute then
    return false;
  end if;
  insert into public.monitoring_ingest_buckets(project_id, bucket_start, span_count)
  values (p_project_id, date_trunc('minute', now()), p_count)
  on conflict (project_id, bucket_start) do update
    set span_count = public.monitoring_ingest_buckets.span_count + excluded.span_count
    where public.monitoring_ingest_buckets.span_count + excluded.span_count <= p_max_per_minute
  returning span_count into v_count;
  return v_count is not null;
end;
$$;
revoke all on function public.monitoring_claim_ingest_quota(uuid, integer, integer) from public;
revoke all on function public.monitoring_claim_ingest_quota(uuid, integer, integer) from anon, authenticated;
grant execute on function public.monitoring_claim_ingest_quota(uuid, integer, integer) to service_role;

-- IMPORTANT: Add scheduled deletion/retention before production use:
--   monitoring_spans: choose a bounded retention policy (e.g., 7 days in pilot).
--   monitoring_ingest_buckets: delete old minute buckets regularly.
-- Don't enable direct client access or public sharing of these tables.
