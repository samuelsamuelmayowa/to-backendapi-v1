-- Upgrade legacy Options wallets once, preserving positions and trade history.
-- Run in the Supabase SQL editor for the project used by the trading simulator.
begin;

lock table public.options_practice_accounts in exclusive mode;

alter table public.options_practice_accounts
  add column if not exists cash_raised_to_100k boolean not null default false;

-- Reconstruct original funding from cash and fills. This also protects wallets
-- created or reset to $100,000 before this migration was applied.
with funding as (
  select account.user_id,
    (account.state->>'cash')::numeric + coalesce((
      select sum(case coalesce(fill->>'action', fill->>'side')
        when 'buy' then (fill->>'total')::numeric
        when 'sell' then -(fill->>'total')::numeric
        else 0 end)
      from jsonb_array_elements(account.state->'history') fill
    ), 0) as starting_cash
  from public.options_practice_accounts account
  where not account.cash_raised_to_100k
)
update public.options_practice_accounts account
set state = jsonb_set(account.state, '{cash}',
      to_jsonb((account.state->>'cash')::numeric + 90000), true),
    version = account.version + 1,
    updated_at = now(),
    cash_raised_to_100k = true
from funding
where account.user_id = funding.user_id
  and round(funding.starting_cash, 2) = 10000;

alter table public.options_practice_accounts
  alter column cash_raised_to_100k set default true;

alter table public.options_practice_accounts
  alter column state set default '{"cash":100000,"positions":[],"history":[]}'::jsonb;

notify pgrst, 'reload schema';
commit;

-- Verify the stored funds after applying the migration.
select state->>'cash' as practice_cash, cash_raised_to_100k
from public.options_practice_accounts;
