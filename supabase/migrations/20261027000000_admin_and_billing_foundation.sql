begin;

-- Who may open the admin dashboard. Matched by VERIFIED email address.
-- No policies on purpose: only the backend (service role) can read or change it.
create table public.admin_allowlist (
  email text primary key check (email = lower(email)),
  note text,
  created_at timestamptz not null default now()
);

-- Subscriptions and payments. They start empty and are filled by the payment
-- feature (Paystack). The admin dashboard reads them for revenue figures.
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  plan text not null check (length(plan) between 1 and 60),
  status text not null default 'active'
    check (status in ('active', 'cancelled', 'expired', 'past_due')),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  amount numeric(12, 2) not null check (amount >= 0),
  billing_interval text not null check (billing_interval in ('monthly', 'yearly')),
  current_period_start timestamptz not null default now(),
  current_period_end timestamptz not null,
  provider text not null default 'paystack',
  provider_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index subscriptions_user_idx on public.subscriptions (user_id, status);
create unique index subscriptions_provider_reference_unique
  on public.subscriptions (provider, provider_reference)
  where provider_reference is not null;

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  amount numeric(12, 2) not null check (amount > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  status text not null
    check (status in ('pending', 'succeeded', 'failed', 'refunded')),
  provider text not null default 'paystack',
  provider_reference text not null,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  unique (provider, provider_reference),
  check (status <> 'succeeded' or paid_at is not null)
);
create index payments_user_idx on public.payments (user_id, created_at desc);
create index payments_paid_at_idx on public.payments (paid_at desc)
  where status = 'succeeded';

-- Locked down: browsers using the publishable key can never touch these tables.
alter table public.admin_allowlist enable row level security;
alter table public.subscriptions enable row level security;
alter table public.payments enable row level security;
revoke all on table public.admin_allowlist from anon, authenticated;
revoke all on table public.subscriptions from anon, authenticated;
revoke all on table public.payments from anon, authenticated;

commit;
