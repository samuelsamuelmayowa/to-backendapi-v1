-- Dedicated training-data tables only. This migration does not touch application,
-- student, authentication, saved-work, or billing tables.
create table if not exists public.splunk_lab_datasets (
  slug text primary key,
  name text not null,
  description text not null,
  index_name text not null unique check (left(index_name, 4) = 'toa_'),
  source_category text not null,
  sourcetypes text[] not null default '{}',
  fields text[] not null default '{}',
  event_count integer not null check (event_count >= 0),
  earliest_time timestamptz,
  latest_time timestamptz,
  data_origin text not null,
  is_synthetic boolean not null default true check (is_synthetic),
  distribution_status text not null default 'approved_synthetic',
  version text not null,
  status text not null check (status in ('ready', 'importing')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.splunk_lab_events (
  event_id text primary key check (event_id ~ '^[0-9a-f]{24}$'),
  dataset_slug text not null references public.splunk_lab_datasets(slug) on delete cascade,
  dataset_version text not null,
  index_name text not null check (left(index_name, 4) = 'toa_'),
  event_time timestamptz,
  sourcetype text not null,
  event_data jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists splunk_lab_events_dataset_time_idx
  on public.splunk_lab_events (index_name, dataset_slug, dataset_version, event_time);
create index if not exists splunk_lab_events_dataset_type_idx
  on public.splunk_lab_events (index_name, dataset_slug, dataset_version, sourcetype);
create index if not exists splunk_lab_events_dataset_id_idx
  on public.splunk_lab_events (dataset_slug, dataset_version, event_id);

alter table public.splunk_lab_datasets enable row level security;
alter table public.splunk_lab_events enable row level security;
revoke all on public.splunk_lab_datasets, public.splunk_lab_events from anon, authenticated;
grant select, insert, update on public.splunk_lab_datasets, public.splunk_lab_events to service_role;
