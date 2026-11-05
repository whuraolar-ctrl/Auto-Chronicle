begin;

create table public.repairs (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  issue_id uuid references public.issues(id) on delete set null,
  recorded_by uuid not null references public.profiles(id) on delete cascade,
  work_performed text not null
    check (length(btrim(work_performed)) between 1 and 2000),
  provider_name text check (length(provider_name) <= 150),
  repair_date date not null,
  amount numeric(15, 2) not null
    check (amount >= 0 and amount <= 9999999999999.99),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  idempotency_key text check (length(idempotency_key) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index repairs_vehicle_activity_idx
  on public.repairs (vehicle_id, repair_date desc, created_at desc);
create unique index repairs_recorded_by_idempotency_key_unique
  on public.repairs (recorded_by, idempotency_key)
  where idempotency_key is not null;

create table public.repair_parts (
  id uuid primary key default gen_random_uuid(),
  repair_id uuid not null references public.repairs(id) on delete cascade,
  part_name text not null check (length(btrim(part_name)) between 1 and 100),
  amount numeric(15, 2) not null
    check (amount >= 0 and amount <= 9999999999999.99),
  created_at timestamptz not null default now()
);
create index repair_parts_repair_idx
  on public.repair_parts (repair_id, created_at);

create table public.media (
  id uuid primary key default gen_random_uuid(),
  repair_id uuid not null references public.repairs(id) on delete cascade,
  uploaded_by uuid not null references public.profiles(id) on delete cascade,
  storage_bucket text not null,
  storage_path text not null,
  media_type text not null check (media_type = 'receipt'),
  mime_type text not null
    check (mime_type in ('image/jpeg', 'image/png', 'application/pdf')),
  file_size_bytes bigint not null
    check (file_size_bytes between 1 and 5242880),
  created_at timestamptz not null default now()
);
create unique index media_one_receipt_per_repair
  on public.media (repair_id)
  where media_type = 'receipt';

alter table public.repairs enable row level security;
alter table public.repair_parts enable row level security;
alter table public.media enable row level security;

create policy repairs_owner_all on public.repairs
  for all to authenticated
  using (recorded_by = auth.uid())
  with check (recorded_by = auth.uid());
create policy repair_parts_owner_all on public.repair_parts
  for all to authenticated
  using (
    exists (
      select 1 from public.repairs r
      where r.id = repair_id and r.recorded_by = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.repairs r
      where r.id = repair_id and r.recorded_by = auth.uid()
    )
  );
create policy media_owner_all on public.media
  for all to authenticated
  using (uploaded_by = auth.uid())
  with check (uploaded_by = auth.uid());

insert into storage.buckets (
  id, name, public, file_size_limit, allowed_mime_types
) values (
  'receipts',
  'receipts',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'application/pdf']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

commit;
