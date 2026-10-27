-- OPTIONAL (Supabase): after enabling the pg_cron extension in Database > Extensions,
-- run this in SQL Editor so virtual payslips are issued each month even if users are offline.
-- It pays ONLY for the previous CLOSED UTC month. The RPC prevents double payment.

create or replace function public.skill_lab_pay_all_previous_month()
returns void language plpgsql security definer set search_path = public as $$
declare v_employment record;
        v_pay_month date := (date_trunc('month', now() at time zone 'UTC') - interval '1 month')::date;
begin
  for v_employment in
    select id from public.skill_lab_employments
    where status = 'active' and started_at < date_trunc('month', now() at time zone 'UTC')
  loop
    perform public.skill_lab_settle_month(v_employment.id, v_pay_month);
  end loop;
end;
$$;
revoke all on function public.skill_lab_pay_all_previous_month() from public, anon, authenticated;
grant execute on function public.skill_lab_pay_all_previous_month() to service_role;
-- Runs 00:05 UTC on the first day of each month.
select cron.schedule(
  'to-skilllab-virtual-monthly-payroll',
  '5 0 1 * *',
  'select public.skill_lab_pay_all_previous_month()'
);
