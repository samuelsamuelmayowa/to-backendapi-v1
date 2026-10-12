-- Upgrade existing Options wallets without changing positions or trade history.
begin;

alter table public.options_practice_accounts
  add column if not exists cash_raised_to_100k boolean not null default false;

update public.options_practice_accounts
set state = case
      when state ? 'cash' then jsonb_set(
        state,
        '{cash}',
        to_jsonb((state->>'cash')::numeric + 90000),
        true
      )
      else state
    end,
    version = version + 1,
    updated_at = now(),
    cash_raised_to_100k = true
where not cash_raised_to_100k;

alter table public.options_practice_accounts
  alter column cash_raised_to_100k set default true;

alter table public.options_practice_accounts
  alter column state set default '{"cash":100000,"positions":[],"history":[]}'::jsonb;

notify pgrst, 'reload schema';
commit;
