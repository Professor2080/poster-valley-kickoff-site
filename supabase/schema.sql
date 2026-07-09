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
