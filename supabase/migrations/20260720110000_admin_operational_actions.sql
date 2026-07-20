-- A3 additive operational state. Apply to the isolated staging project first.
alter table public.orders add column if not exists fulfilment_status text not null default 'unfulfilled'
  check (fulfilment_status in ('unfulfilled', 'ready_to_pack', 'packed', 'shipped'));
alter table public.orders add column if not exists carrier text;
alter table public.orders add column if not exists tracking_number text;
alter table public.orders add column if not exists shipped_at timestamptz;

create table if not exists public.manual_shipping_quotes (
  id uuid primary key default gen_random_uuid(),
  invitation_id uuid not null references public.order_invitations(id) on delete cascade,
  country_code text not null check (country_code ~ '^[A-Z]{2}$'),
  shipping_amount numeric(10,2) not null check (shipping_amount >= 0),
  currency text not null default 'EUR', expires_at timestamptz not null,
  status text not null default 'approved' check (status in ('approved', 'expired', 'cancelled')),
  approved_by uuid references auth.users(id) on delete set null, created_at timestamptz not null default now()
);
create index if not exists manual_shipping_quotes_invitation_idx on public.manual_shipping_quotes(invitation_id, created_at desc);
alter table public.manual_shipping_quotes enable row level security;

create table if not exists public.email_delivery_events (
  id uuid primary key default gen_random_uuid(), occurred_at timestamptz not null default now(),
  entity_type text not null, entity_id text not null, template text not null,
  delivery_status text not null check (delivery_status in ('suppressed', 'sent', 'failed')),
  correlation_id uuid, details jsonb not null default '{}'::jsonb
);
create index if not exists email_delivery_events_entity_idx on public.email_delivery_events(entity_type, entity_id, occurred_at desc);
alter table public.email_delivery_events enable row level security;
-- Rollback: drop the two A3 tables, then drop the four added orders columns.
