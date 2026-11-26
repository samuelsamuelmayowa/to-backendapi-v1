-- REVIEW REQUIRED. Do not run automatically. Existing Monitoring tables only.
-- Apply after both 20261124/25 migrations, before enabling advanced traces.
begin;
set local search_path = '';
set local lock_timeout = '5s';
set local statement_timeout = '60s';
alter table public.monitoring_spans
  alter column http_method drop not null,
  drop constraint monitoring_spans_http_method_check,
  add column parent_span_id text,
  add column span_kind text not null default 'SERVER',
  add column span_name text,
  add column environment text,
  add column service_version text,
  add column db_system text,
  add column db_operation text,
  add column error_type text,
  add constraint monitoring_spans_http_method_check check (http_method is null or http_method in ('GET','POST','PUT','PATCH','DELETE','HEAD','OPTIONS','TRACE','CONNECT','_OTHER')),
  add constraint monitoring_spans_parent_check check (parent_span_id is null or (parent_span_id ~ '^[0-9a-f]{16}$' and parent_span_id <> repeat('0',16) and parent_span_id <> span_id)),
  add constraint monitoring_spans_kind_check check (span_kind in ('SERVER','CLIENT')),
  add constraint monitoring_spans_environment_check check (environment is null or environment in ('development','staging','production','test')),
  add constraint monitoring_spans_version_check check (service_version is null or service_version ~ '^[0-9]{1,5}\.[0-9]{1,5}\.[0-9]{1,5}$'),
  add constraint monitoring_spans_error_type_check check (error_type is null or error_type in ('Error','TypeError','RangeError','SyntaxError','ReferenceError','TimeoutError','AbortError','ECONNREFUSED','ECONNRESET','ETIMEDOUT','ENOTFOUND','timeout')),
  add constraint monitoring_spans_dependency_check check (
    (http_method is not null and db_system is null and db_operation is null)
    or (span_kind='CLIENT' and http_method is null and http_route is null and http_status is null
      and db_system is not null and db_operation is not null
      and db_system in ('mysql','postgresql','sqlite','redis','mongodb')
      and db_operation in ('SELECT','INSERT','UPDATE','DELETE','CREATE','ALTER','DROP','BEGIN','COMMIT','ROLLBACK','GET','SET','DEL','FIND','FINDONE','AGGREGATE','COUNT','PING','EXECUTE','query'))),
  add constraint monitoring_spans_client_route_check check (span_kind='SERVER' or http_route is null),
  add constraint monitoring_spans_name_check check (span_name is null or
    span_name = case when db_system is not null then db_system || ' ' || db_operation else 'HTTP ' || span_kind || ' ' || http_method end);
create index monitoring_spans_trace_time_idx on public.monitoring_spans(project_id,trace_id,started_at);

create function public.monitoring_ingest_spans_v2(p_key_hash text,p_spans jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_key public.monitoring_project_keys%rowtype;
  v_stored integer;
  v_count integer;
  v_now timestamptz;
begin
  if pg_catalog.jsonb_typeof(p_spans) is distinct from 'array' then
    raise exception using errcode='22023',message='Expected span array';
  end if;
  if pg_catalog.jsonb_array_length(p_spans)>100 or pg_catalog.octet_length(p_spans::text)>262144 then
    raise exception using errcode='22023',message='Span batch exceeds limits';
  end if;
  if exists (select 1 from pg_catalog.jsonb_to_recordset(p_spans) as x(started_at timestamptz,span_name text)
    where x.span_name is null or x.started_at < pg_catalog.clock_timestamp()-interval '7 days'
      or x.started_at > pg_catalog.clock_timestamp()+interval '5 minutes') then
    raise exception using errcode='22023',message='Invalid advanced span';
  end if;
  -- Serialize with revocation; a key revoked before this lock is rejected.
  -- Empty/malformed hashes cannot match a key. Never use a client project ID.
  select k.* into v_key from public.monitoring_project_keys k
    where k.key_hash=p_key_hash and k.revoked_at is null for update;
  if not found then return pg_catalog.jsonb_build_object('error','invalid_key'); end if;
  -- All keys for a project serialize quota and timestamp updates together.
  perform 1 from public.monitoring_projects p where p.id=v_key.project_id for update;
  if not found then return pg_catalog.jsonb_build_object('error','invalid_key'); end if;
  -- Capture wall-clock time AFTER lock waits (not transaction start time).
  v_now:=pg_catalog.clock_timestamp();
  begin
    insert into public.monitoring_spans(project_id,received_at,started_at,service_name,trace_id,span_id,
      http_method,http_route,http_status,duration_ms,span_error,parent_span_id,span_kind,span_name,environment,service_version,db_system,db_operation,error_type)
    select v_key.project_id,v_now,x.started_at,x.service_name,pg_catalog.lower(x.trace_id),pg_catalog.lower(x.span_id),
      x.http_method,x.http_route,x.http_status,x.duration_ms,coalesce(x.span_error,false),x.parent_span_id,x.span_kind,x.span_name,x.environment,x.service_version,x.db_system,x.db_operation,x.error_type
    from pg_catalog.jsonb_to_recordset(p_spans) as x(started_at timestamptz,service_name text,trace_id text,
      span_id text,http_method text,http_route text,http_status integer,duration_ms numeric,span_error boolean,parent_span_id text,span_kind text,span_name text,environment text,service_version text,db_system text,db_operation text,error_type text)
    on conflict(project_id,trace_id,span_id) do nothing;
    get diagnostics v_stored=row_count;
    if v_stored>0 then
      insert into public.monitoring_ingest_buckets as b(project_id,bucket_start,span_count)
        values(v_key.project_id,pg_catalog.date_trunc('minute',v_now),v_stored)
      on conflict(project_id,bucket_start) do update set span_count=b.span_count+excluded.span_count
        where b.span_count+excluded.span_count<=600
      returning span_count into v_count;
      if v_count is null then
        raise exception using errcode='P0001',message='monitoring_quota_exceeded';
      end if;
      update public.monitoring_projects set last_received_at=greatest(last_received_at,v_now) where id=v_key.project_id;
    end if;
    update public.monitoring_project_keys set last_used_at=v_now where id=v_key.id;
  exception when sqlstate 'P0001' then
    -- The subtransaction rolls back ALL span/quota/timestamp writes on failure.
    if sqlerrm='monitoring_quota_exceeded' then
      return pg_catalog.jsonb_build_object('error','quota_exceeded');
    end if;
    raise;
  end;
  return pg_catalog.jsonb_build_object('stored',v_stored);
end;
$$;

-- Remove inherited custom default function grants as well as PUBLIC/browser access.
do $$
declare g record;
begin
  for g in select a.grantee,r.rolname from pg_catalog.pg_proc p
    cross join lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a
    left join pg_catalog.pg_roles r on r.oid=a.grantee
    where p.oid='public.monitoring_ingest_spans_v2(text,jsonb)'::pg_catalog.regprocedure and a.grantee<>p.proowner
  loop
    execute pg_catalog.format('revoke all on function public.monitoring_ingest_spans_v2(text,jsonb) from %s',
      case when g.grantee=0 then 'PUBLIC' else pg_catalog.quote_ident(g.rolname) end);
  end loop;
end;
$$;
grant execute on function public.monitoring_ingest_spans_v2(text,jsonb) to service_role;
commit;
