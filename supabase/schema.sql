create extension if not exists pgcrypto;

create table if not exists public.drop_interest_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  drop_id text,
  drop_slug text not null,
  drop_title text not null,
  first_name text,
  last_name text,
  full_name text not null,
  email text not null,
  email_normalized text,
  country text not null,
  country_code text,
  preferred_format text not null,
  quantity integer not null check (quantity between 1 and 10),
  shipping_address text,
  note text,
  source_path text,
  consent_contact boolean not null default true,
  accepted_reservation_terms boolean not null default true,
  marketing_opt_in boolean not null default false,
  reservation_token uuid not null default gen_random_uuid(),
  reservation_status text not null default 'new' check (
    reservation_status in ('new', 'contacted', 'order_invited', 'converted', 'cancelled')
  ),
  status text not null default 'new' check (
    status in ('new', 'contacted', 'payment_link_sent', 'converted', 'cancelled')
  ),
  metadata jsonb not null default '{}'::jsonb
);

alter table public.drop_interest_requests
  add column if not exists drop_id text,
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists email_normalized text,
  add column if not exists country_code text,
  add column if not exists accepted_reservation_terms boolean not null default true,
  add column if not exists marketing_opt_in boolean not null default false,
  add column if not exists reservation_token uuid not null default gen_random_uuid(),
  add column if not exists reservation_status text not null default 'new',
  add column if not exists metadata jsonb not null default '{}'::jsonb;

update public.drop_interest_requests
set email_normalized = lower(email)
where email_normalized is null;

create index if not exists drop_interest_requests_drop_slug_idx
  on public.drop_interest_requests (drop_slug);

create index if not exists drop_interest_requests_created_at_idx
  on public.drop_interest_requests (created_at desc);

create index if not exists drop_interest_requests_status_idx
  on public.drop_interest_requests (status);

create index if not exists drop_interest_requests_reservation_status_idx
  on public.drop_interest_requests (reservation_status);

create index if not exists drop_interest_requests_email_normalized_idx
  on public.drop_interest_requests (email_normalized);

alter table public.drop_interest_requests enable row level security;

create table if not exists public.newsletter_signups (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  email text not null,
  email_normalized text generated always as (lower(email)) stored,
  source_path text,
  consent_newsletter boolean not null default true,
  status text not null default 'active' check (status in ('active', 'unsubscribed')),
  unique (email_normalized)
);

create index if not exists newsletter_signups_created_at_idx
  on public.newsletter_signups (created_at desc);

create index if not exists newsletter_signups_status_idx
  on public.newsletter_signups (status);

alter table public.newsletter_signups enable row level security;

create table if not exists public.order_invitations (
  id uuid primary key default gen_random_uuid(),
  interest_request_id uuid references public.drop_interest_requests (id) on delete set null,
  drop_id text not null,
  drop_slug text not null,
  drop_title text not null,
  email text not null,
  email_normalized text not null,
  first_name text,
  last_name text,
  quantity integer not null check (quantity between 1 and 10),
  currency text not null default 'EUR',
  unit_price numeric(10, 2) not null,
  subtotal_amount numeric(10, 2) not null,
  status text not null default 'draft' check (
    status in ('draft', 'sent', 'opened', 'order_started', 'payment_open', 'paid', 'expired', 'cancelled')
  ),
  token_hash text not null unique,
  expires_at timestamptz,
  sent_at timestamptz,
  opened_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists order_invitations_interest_request_id_idx
  on public.order_invitations (interest_request_id);

create index if not exists order_invitations_token_hash_idx
  on public.order_invitations (token_hash);

create index if not exists order_invitations_status_idx
  on public.order_invitations (status);

create index if not exists order_invitations_created_at_idx
  on public.order_invitations (created_at desc);

alter table public.order_invitations enable row level security;

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  invitation_id uuid not null references public.order_invitations (id) on delete cascade,
  interest_request_id uuid references public.drop_interest_requests (id) on delete set null,
  drop_id text not null,
  drop_slug text not null,
  drop_title text not null,
  status text not null default 'draft' check (
    status in ('draft', 'awaiting_payment', 'payment_open', 'paid', 'payment_failed', 'payment_expired', 'cancelled', 'shipped')
  ),
  email text not null,
  first_name text not null,
  last_name text not null,
  quantity integer not null check (quantity between 1 and 10),
  currency text not null default 'EUR',
  unit_price numeric(10, 2) not null,
  subtotal_amount numeric(10, 2) not null,
  shipping_amount numeric(10, 2) not null,
  total_amount numeric(10, 2) not null,
  shipping_profile_id text not null,
  shipping_country text not null,
  shipping_country_code text not null,
  shipping_name text not null,
  address_line1 text not null,
  address_line2 text,
  postal_code text not null,
  city text not null,
  region text,
  accepted_terms_at timestamptz not null,
  customer_confirmation_sent_at timestamptz,
  internal_paid_notification_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists orders_invitation_id_idx
  on public.orders (invitation_id);

create index if not exists orders_status_idx
  on public.orders (status);

create index if not exists orders_created_at_idx
  on public.orders (created_at desc);

alter table public.orders enable row level security;

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  provider text not null default 'mollie',
  provider_payment_id text not null unique,
  status text not null default 'created' check (
    status in ('created', 'open', 'paid', 'failed', 'expired', 'canceled', 'unknown')
  ),
  amount numeric(10, 2) not null,
  currency text not null default 'EUR',
  checkout_url text,
  redirect_url text,
  webhook_received_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists payments_order_id_idx
  on public.payments (order_id);

create index if not exists payments_provider_payment_id_idx
  on public.payments (provider_payment_id);

create index if not exists payments_status_idx
  on public.payments (status);

alter table public.payments enable row level security;
