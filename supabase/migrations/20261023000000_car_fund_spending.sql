begin;

create table public.car_fund_spending (
  id uuid primary key default gen_random_uuid(),
  fund_id uuid not null references public.car_funds(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  amount numeric(12, 2) not null check (amount > 0),
  spent_at timestamptz not null default now(),
  note text check (length(note) <= 500),
  created_at timestamptz not null default now()
);

create index car_fund_spending_activity_idx
  on public.car_fund_spending (fund_id, spent_at desc, id desc);

alter table public.car_fund_spending enable row level security;
create policy car_fund_spending_owner_all on public.car_fund_spending
  for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.car_funds f
      where f.id = fund_id and f.user_id = auth.uid()
    )
  );

create or replace function public.prevent_car_fund_overdrawn_contribution_delete()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_balance_after_delete numeric;
begin
  perform 1
  from public.car_funds
  where id = old.fund_id
  for update;

  select
    coalesce((select sum(amount) from public.car_fund_contributions where fund_id = old.fund_id), 0)
    - old.amount
    - coalesce((select sum(amount) from public.car_fund_spending where fund_id = old.fund_id), 0)
  into v_balance_after_delete;

  if v_balance_after_delete < 0 then
    raise exception 'car_fund_contribution_is_spent';
  end if;
  return old;
end;
$$;

create trigger car_fund_contributions_prevent_overdraw
  before delete on public.car_fund_contributions
  for each row execute function public.prevent_car_fund_overdrawn_contribution_delete();

create or replace function public.prevent_car_fund_currency_change()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.currency <> old.currency and (
    exists (
      select 1 from public.car_fund_contributions
      where fund_id = old.id
    )
    or exists (
      select 1 from public.car_fund_spending
      where fund_id = old.id
    )
  ) then
    raise exception 'car_fund_currency_has_contributions';
  end if;
  return new;
end;
$$;

create or replace function public.record_car_fund_spending(
  p_user_id uuid,
  p_amount numeric,
  p_spent_at timestamptz,
  p_note text
)
returns public.car_fund_spending
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_fund public.car_funds%rowtype;
  v_balance numeric;
  v_spending public.car_fund_spending%rowtype;
begin
  if p_amount <= 0 or p_amount > 9999999999.99 then
    raise exception 'invalid_car_fund_spending_amount';
  end if;
  if p_note is not null and length(p_note) > 500 then
    raise exception 'invalid_car_fund_spending_note';
  end if;

  select * into v_fund
  from public.car_funds
  where user_id = p_user_id
  for update;

  if not found then
    raise exception 'car_fund_not_found';
  end if;

  select
    coalesce((select sum(amount) from public.car_fund_contributions where fund_id = v_fund.id), 0)
    - coalesce((select sum(amount) from public.car_fund_spending where fund_id = v_fund.id), 0)
  into v_balance;

  if p_amount > v_balance then
    raise exception 'car_fund_spending_exceeds_balance';
  end if;

  insert into public.car_fund_spending (fund_id, user_id, amount, spent_at, note)
  values (v_fund.id, p_user_id, p_amount, coalesce(p_spent_at, now()), nullif(btrim(p_note), ''))
  returning * into v_spending;

  return v_spending;
end;
$$;

revoke all on function public.record_car_fund_spending(uuid, numeric, timestamptz, text)
  from public, anon, authenticated;
grant execute on function public.record_car_fund_spending(uuid, numeric, timestamptz, text)
  to service_role;

commit;
