-- READ ONLY. Review the results before approving any Monitoring migration.
select pg_catalog.current_database() database_name, current_user migration_actor,
  pg_catalog.current_setting('server_version') postgres_version;
select name,pg_catalog.to_regclass('public.'||name) existing_relation
from (values ('monitoring_projects'),('monitoring_project_keys'),('monitoring_spans'),('monitoring_ingest_buckets')) expected(name);
select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema='public' and table_name in (
  'monitoring_projects','monitoring_project_keys','monitoring_spans','monitoring_ingest_buckets',
  'to_monitor_projects','to_monitor_keys','to_monitor_spans'
) order by table_name, ordinal_position;

select tablename, rowsecurity from pg_tables
where schemaname='public' and tablename like 'monitoring_%';
select tablename, policyname, roles, cmd, qual, with_check from pg_policies
where schemaname='public' and tablename like 'monitoring_%';
select table_name, grantee, privilege_type from information_schema.role_table_grants
where table_schema='public' and table_name like 'monitoring_%';
select table_name, column_name, grantee, privilege_type from information_schema.column_privileges
where table_schema='public' and table_name like 'monitoring_%'
order by table_name,column_name,grantee,privilege_type;
select p.proname, p.prosecdef, p.proconfig, p.proacl,
  pg_catalog.pg_get_userbyid(p.proowner) function_owner,
  pg_get_function_identity_arguments(p.oid) arguments,
  pg_get_functiondef(p.oid) definition
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname like 'monitoring_%';

-- The exact legacy quota function is removable only when no unexpected dependent
-- objects/callers exist. DROP in migration 2 deliberately has no CASCADE.
select pg_catalog.pg_describe_object(d.classid,d.objid,d.objsubid) dependent_object,d.deptype
from pg_catalog.pg_depend d
where d.refclassid='pg_catalog.pg_proc'::pg_catalog.regclass
  and d.refobjid=pg_catalog.to_regprocedure('public.monitoring_claim_ingest_quota(uuid,integer,integer)');
