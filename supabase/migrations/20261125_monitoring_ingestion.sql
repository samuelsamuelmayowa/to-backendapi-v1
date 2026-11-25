-- Apply ONCE after 20261124_monitoring_v1.sql. Monitoring objects only.
-- Function creation and EXECUTE revocation commit together: no public access gap.
begin;
set local search_path = '';
set local lock_timeout = '5s';
set local statement_timeout = '60s';

alter table public.monitoring_projects add column last_received_at timestamptz
  check (last_received_at is null or pg_catalog.isfinite(last_received_at));
create index monitoring_spans_retention_idx on public.monitoring_spans(received_at,id);
create index monitoring_buckets_retention_idx on public.monitoring_ingest_buckets(bucket_start,project_id);

-- Backend references checked: no callers of this old, separately claimable quota.
-- NO CASCADE: unexpected dependencies abort the migration for review.
drop function if exists public.monitoring_claim_ingest_quota(uuid,integer,integer);

create function public.monitoring_create_project_key(
  p_project_id uuid,p_owner_user_id text,p_key_hash text,p_key_prefix text
) returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_key public.monitoring_project_keys%rowtype;
begin
  if p_owner_user_id is null or pg_catalog.btrim(p_owner_user_id)='' then
    return pg_catalog.jsonb_build_object('error','not_found');
  end if;
  -- Serialize concurrent key creation. Ownership comes from verified server claims.
  perform 1 from public.monitoring_projects p
    where p.id=p_project_id and p.owner_user_id=p_owner_user_id for update;
  if not found then return pg_catalog.jsonb_build_object('error','not_found'); end if;
  if (select pg_catalog.count(*) from public.monitoring_project_keys k
      where k.project_id=p_project_id and k.revoked_at is null)>=3 then
    return pg_catalog.jsonb_build_object('error','key_limit');
  end if;
  insert into public.monitoring_project_keys(project_id,key_hash,key_prefix)
    values(p_project_id,p_key_hash,p_key_prefix) returning * into v_key;
  return pg_catalog.jsonb_build_object('id',v_key.id,'key_prefix',v_key.key_prefix,'created_at',v_key.created_at);
end;
$$;

create function public.monitoring_ingest_spans(p_key_hash text,p_spans jsonb)
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
      http_method,http_route,http_status,duration_ms,span_error)
    select v_key.project_id,v_now,x.started_at,x.service_name,pg_catalog.lower(x.trace_id),pg_catalog.lower(x.span_id),
      x.http_method,x.http_route,x.http_status,x.duration_ms,coalesce(x.span_error,false)
    from pg_catalog.jsonb_to_recordset(p_spans) as x(started_at timestamptz,service_name text,trace_id text,
      span_id text,http_method text,http_route text,http_status integer,duration_ms numeric,span_error boolean)
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

create function public.monitoring_prune_expired()
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_spans integer;v_buckets integer;v_now timestamptz:=pg_catalog.clock_timestamp();
begin
  if not pg_catalog.pg_try_advisory_xact_lock(746620251125::bigint) then
    return pg_catalog.jsonb_build_object('busy',true);
  end if;
  delete from public.monitoring_spans s where s.id in
    (select old.id from public.monitoring_spans old where old.received_at<v_now-interval '7 days'
      order by old.received_at,old.id limit 10000 for update skip locked);
  get diagnostics v_spans=row_count;
  delete from public.monitoring_ingest_buckets b where (b.project_id,b.bucket_start) in
    (select old.project_id,old.bucket_start from public.monitoring_ingest_buckets old
      where old.bucket_start<v_now-interval '2 hours'
      order by old.bucket_start,old.project_id limit 10000 for update skip locked);
  get diagnostics v_buckets=row_count;
  return pg_catalog.jsonb_build_object('spans_deleted',v_spans,'buckets_deleted',v_buckets);
end;
$$;

-- Remove every default EXECUTE grantee on THESE THREE FUNCTIONS only, even if
-- the shared database has custom default grants. Owners retain implicit rights.
do $$
declare v_grant record;
begin
  for v_grant in
    select distinct p.oid,p.oid::pg_catalog.regprocedure signature,a.grantee,r.rolname
    from pg_catalog.pg_proc p
    cross join lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a
    left join pg_catalog.pg_roles r on r.oid=a.grantee
    where p.oid in ('public.monitoring_create_project_key(uuid,text,text,text)'::pg_catalog.regprocedure,
      'public.monitoring_ingest_spans(text,jsonb)'::pg_catalog.regprocedure,
      'public.monitoring_prune_expired()'::pg_catalog.regprocedure) and a.grantee<>p.proowner
  loop
    execute pg_catalog.format('revoke all on function %s from %s',v_grant.signature,
      case when v_grant.grantee=0 then 'PUBLIC' else pg_catalog.quote_ident(v_grant.rolname) end);
  end loop;
end;
$$;
revoke all on function public.monitoring_create_project_key(uuid,text,text,text) from public,anon,authenticated,service_role;
revoke all on function public.monitoring_ingest_spans(text,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.monitoring_prune_expired() from public,anon,authenticated,service_role;
grant execute on function public.monitoring_create_project_key(uuid,text,text,text) to service_role;
grant execute on function public.monitoring_ingest_spans(text,jsonb) to service_role;
grant execute on function public.monitoring_prune_expired() to service_role;
commit;
