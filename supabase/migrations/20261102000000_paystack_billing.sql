begin;

-- ---------------------------------------------------------------------------
-- Extra details we remember about every checkout.
-- (The payments and subscriptions tables come from 20261027000000.)
-- ---------------------------------------------------------------------------
alter table public.payments
  add column plan text,
  add column billing_interval text,
  add column quantity integer not null default 1,
  add column provider_transaction_id text,
  add column failure_reason text;

alter table public.payments
  add constraint payments_billing_interval_check
    check (billing_interval is null or billing_interval in ('monthly', 'yearly')),
  add constraint payments_quantity_check
    check (quantity between 1 and 1000),
  -- A reference can never be blank or tiny.
  add constraint payments_reference_length_check
    check (length(trim(provider_reference)) between 8 and 100),
  -- Every Paystack payment must say what it is paying for.
  add constraint payments_checkout_details_check
    check (provider <> 'paystack' or (plan is not null and billing_interval is not null));

-- The same Paystack transaction can never be attached to two payments.
create unique index payments_provider_transaction_unique
  on public.payments (provider, provider_transaction_id)
  where provider_transaction_id is not null;

alter table public.subscriptions
  add column quantity integer not null default 1;

alter table public.subscriptions
  add constraint subscriptions_quantity_check check (quantity between 1 and 1000);

-- One active subscription per person, enforced by the database.
create unique index subscriptions_one_active_per_user
  on public.subscriptions (user_id)
  where status = 'active';

-- ---------------------------------------------------------------------------
-- settle_payment: turns a confirmed Paystack payment into a subscription.
-- Safe to call any number of times for the same payment: it only ever applies
-- it ONCE. The row lock stops two requests (webhook + browser) racing.
-- Only the backend (service role) may run it.
-- ---------------------------------------------------------------------------
create or replace function public.settle_payment(
  p_reference text,
  p_amount_minor bigint,
  p_currency text,
  p_provider_transaction_id text,
  p_paid_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.payments%rowtype;
  v_sub public.subscriptions%rowtype;
  v_has_sub boolean;
  v_length interval;
  v_start timestamptz;
  v_end timestamptz;
  v_sub_id uuid;
begin
  -- Empty or meaningless transactions are refused.
  if p_reference is null or length(trim(p_reference)) = 0 then
    raise exception 'EMPTY_REFERENCE';
  end if;
  if p_amount_minor is null or p_amount_minor <= 0 then
    raise exception 'EMPTY_AMOUNT';
  end if;

  -- Lock this payment row until we finish.
  select * into v_payment
    from public.payments
   where provider = 'paystack' and provider_reference = p_reference
   for update;

  if not found then
    raise exception 'UNKNOWN_REFERENCE';
  end if;

  -- Already applied: do nothing. This is what makes repeats and retries harmless.
  if v_payment.status = 'succeeded' then
    return jsonb_build_object(
      'result', 'already_processed',
      'subscription_id', v_payment.subscription_id
    );
  end if;

  if v_payment.status <> 'pending' then
    raise exception 'PAYMENT_NOT_PENDING';
  end if;

  -- The amount and currency Paystack confirms must equal what we asked for.
  if round(v_payment.amount * 100)::bigint <> p_amount_minor
     or v_payment.currency <> upper(p_currency) then
    raise exception 'AMOUNT_MISMATCH';
  end if;

  v_length := case v_payment.billing_interval
                when 'yearly' then interval '1 year'
                else interval '1 month'
              end;

  select * into v_sub
    from public.subscriptions
   where user_id = v_payment.user_id and status = 'active'
   for update;
  v_has_sub := found;

  if v_has_sub
     and v_sub.plan = v_payment.plan
     and v_sub.current_period_end > now() then
    -- Renewal: add the new period after the current one, so no paid time is lost.
    v_start := v_sub.current_period_end;
    v_end := v_start + v_length;

    update public.subscriptions
       set current_period_end = v_end,
           amount = v_payment.amount,
           currency = v_payment.currency,
           billing_interval = v_payment.billing_interval,
           quantity = v_payment.quantity,
           updated_at = now()
     where id = v_sub.id;

    v_sub_id := v_sub.id;
  else
    -- New plan, a different plan, or a lapsed one: replace the old subscription.
    if v_has_sub then
      update public.subscriptions
         set status = 'cancelled', updated_at = now()
       where id = v_sub.id;
    end if;

    v_start := now();
    v_end := v_start + v_length;

    insert into public.subscriptions (
      user_id, plan, status, currency, amount, billing_interval,
      current_period_start, current_period_end, provider, provider_reference, quantity
    ) values (
      v_payment.user_id, v_payment.plan, 'active', v_payment.currency, v_payment.amount,
      v_payment.billing_interval, v_start, v_end, 'paystack',
      v_payment.provider_reference, v_payment.quantity
    )
    returning id into v_sub_id;
  end if;

  update public.payments
     set status = 'succeeded',
         paid_at = coalesce(p_paid_at, now()),
         provider_transaction_id = p_provider_transaction_id,
         subscription_id = v_sub_id,
         failure_reason = null
   where id = v_payment.id;

  return jsonb_build_object(
    'result', 'settled',
    'subscription_id', v_sub_id,
    'current_period_end', v_end
  );
end;
$$;

-- Marks subscriptions whose paid period has ended. The backend runs this hourly.
create or replace function public.expire_lapsed_subscriptions()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  update public.subscriptions
     set status = 'expired', updated_at = now()
   where status = 'active' and current_period_end < now();

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.settle_payment(text, bigint, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.settle_payment(text, bigint, text, text, timestamptz)
  to service_role;

revoke all on function public.expire_lapsed_subscriptions()
  from public, anon, authenticated;
grant execute on function public.expire_lapsed_subscriptions() to service_role;

commit;