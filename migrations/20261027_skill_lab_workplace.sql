-- TO SkillLab simulated workplace. Apply ONCE in the Supabase SQL Editor.
-- IMPORTANT: Existing skill_lab_profiles, skill_lab_employments and skill_lab_job_offers
-- are assumed to have UUID primary keys (check your dashboard before applying).
-- All credits are NON-REDEEMABLE training points, never actual wages or cash.

create extension if not exists pgcrypto;

create table if not exists public.skill_lab_task_templates (
  id uuid primary key default gen_random_uuid(),
  role_slug text not null,
  title text not null,
  category text not null default 'investigation',
  difficulty text not null default 'junior',
  brief text not null,
  sample_logs jsonb not null default '[]'::jsonb,
  starter_query text not null default 'index=training',
  expected_output text not null default '',
  rubric jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (role_slug,title)
);

create table if not exists public.skill_lab_tasks (
  id uuid primary key default gen_random_uuid(),
  employment_id uuid not null references public.skill_lab_employments(id) on delete cascade,
  template_id uuid not null references public.skill_lab_task_templates(id),
  assigned_for date not null,
  due_at timestamptz not null,
  status text not null default 'assigned' check (status in ('assigned','needs_revision','completed')),
  spl_query text,
  submission_text text,
  submitted_at timestamptz,
  score integer check (score between 0 and 100),
  feedback jsonb,
  created_at timestamptz not null default now(),
  unique (employment_id,template_id,assigned_for)
);
create index if not exists skill_lab_tasks_employment_day_idx
  on public.skill_lab_tasks(employment_id, assigned_for desc);

create table if not exists public.skill_lab_payroll (
  id uuid primary key default gen_random_uuid(),
  employment_id uuid not null references public.skill_lab_employments(id) on delete cascade,
  pay_month date not null,
  tasks_completed integer not null default 0,
  credits_paid integer not null default 0 check (credits_paid >= 0),
  paid_at timestamptz not null default now(),
  unique(employment_id,pay_month),
  check (extract(day from pay_month) = 1)
);

-- The backend uses a privileged Supabase service client, NOT a frontend anon key.
-- Never let clients write task completions, job offers, or wallets directly.
alter table public.skill_lab_task_templates enable row level security;
alter table public.skill_lab_tasks enable row level security;
alter table public.skill_lab_payroll enable row level security;
revoke all on public.skill_lab_task_templates, public.skill_lab_tasks, public.skill_lab_payroll from anon, authenticated;
grant all on public.skill_lab_task_templates, public.skill_lab_tasks, public.skill_lab_payroll to service_role;

-- Atomic offer acceptance: locks offer row, prevents replay and double hiring.
create or replace function public.skill_lab_accept_offer(p_profile_id uuid,p_offer_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_offer record; v_new uuid;
begin
  -- Serialize acceptance across *different* offers belonging to this same student.
  perform 1 from public.skill_lab_profiles where id=p_profile_id for update;
  if not found then raise exception 'Student profile not found'; end if;
  select * into v_offer from public.skill_lab_job_offers
    where id=p_offer_id and profile_id=p_profile_id for update;
  if not found then raise exception 'Offer not found for your profile'; end if;
  if coalesce(v_offer.status,'') not in ('pending','offered') then raise exception 'This virtual offer has already been used'; end if;
  if v_offer.expires_at is not null and v_offer.expires_at <= now() then
    raise exception 'This virtual offer has expired';
  end if;
  if exists(select 1 from public.skill_lab_employments where profile_id=p_profile_id and status='active') then
    raise exception 'You already have an active virtual job';
  end if;

  insert into public.skill_lab_employments
    (profile_id, offer_id, company_id, role_id, job_level, virtual_salary, started_at, status)
  values
    (p_profile_id, p_offer_id, v_offer.company_id, v_offer.role_id,
     v_offer.job_level, v_offer.virtual_salary, now(), 'active')
  returning id into v_new;

  update public.skill_lab_job_offers set status='accepted' where id=p_offer_id;
  return jsonb_build_object('employmentId',v_new);
end;
$$;

-- Lock the employment so two concurrent payroll runs cannot double credit it.
-- Pay at most one month salary after its calendar month closes, based on
-- MIN(20, completed tickets)/20. No tickets = zero credits.
create or replace function public.skill_lab_settle_month(p_employment_id uuid,p_month date)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_employment record; v_count integer; v_credits integer; v_payroll_id uuid;
begin
  if p_month <> date_trunc('month',p_month::timestamp)::date then
    raise exception 'pay_month must be the first day of the month';
  end if;
  if p_month >= date_trunc('month',now() at time zone 'UTC')::date then
    raise exception 'Cannot pay an unfinished month';
  end if;
  select * into v_employment from public.skill_lab_employments
    where id=p_employment_id for update;
  if not found then raise exception 'Employment not found'; end if;
  if p_month < date_trunc('month',v_employment.started_at at time zone 'UTC')::date then
    raise exception 'Employment was not active in this month';
  end if;
  if v_employment.status <> 'active' then raise exception 'Employment is not active'; end if;

  select count(*) into v_count from public.skill_lab_tasks
    where employment_id=p_employment_id and status='completed'
      and assigned_for >= p_month
      and assigned_for < (p_month + interval '1 month')::date;
  v_credits := floor(greatest(0,v_employment.virtual_salary) * least(20,v_count) / 20.0);
  insert into public.skill_lab_payroll(employment_id,pay_month,tasks_completed,credits_paid)
  values(p_employment_id,p_month,v_count,v_credits)
  on conflict(employment_id,pay_month) do nothing
  returning id into v_payroll_id;

  if v_payroll_id is null then
    return jsonb_build_object('paid',false,'reason','already_settled');
  end if;
  insert into public.skill_lab_wallets(profile_id) values(v_employment.profile_id)
    on conflict(profile_id) do nothing;
  update public.skill_lab_wallets
    set balance=coalesce(balance,0)+v_credits,
        lifetime_earned=coalesce(lifetime_earned,0)+v_credits
    where profile_id=v_employment.profile_id;
  return jsonb_build_object('paid',true,'credits',v_credits,'payrollId',v_payroll_id);
end;
$$;

revoke all on function public.skill_lab_accept_offer(uuid,uuid) from public, anon, authenticated;
revoke all on function public.skill_lab_settle_month(uuid,date) from public, anon, authenticated;
grant execute on function public.skill_lab_accept_offer(uuid,uuid) to service_role;
grant execute on function public.skill_lab_settle_month(uuid,date) to service_role;

-- Useful if your existing database does not enforce one active role per profile:
-- CREATE UNIQUE INDEX skill_lab_one_active_employment ON public.skill_lab_employments(profile_id) WHERE status='active';
-- Apply only after checking no duplicates exist.
