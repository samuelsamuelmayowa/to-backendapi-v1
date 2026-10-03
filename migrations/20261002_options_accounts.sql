-- Separate from paper_accounts, paper_positions and stock fills. Run in Supabase SQL editor.
begin;
create table if not exists public.options_practice_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  version bigint not null default 0,
  state jsonb not null default '{"cash":10000,"positions":[],"history":[]}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint options_cash_nonnegative check ((state->>'cash')::numeric >= 0)
);
alter table public.options_practice_accounts enable row level security;
revoke all on public.options_practice_accounts from anon, authenticated;
grant all on public.options_practice_accounts to service_role;
-- All reads and atomic version-checked writes are performed by the authenticated Express API.
notify pgrst, 'reload schema';
commit;
