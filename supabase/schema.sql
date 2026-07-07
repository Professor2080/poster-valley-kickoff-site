create extension if not exists pgcrypto;

create table if not exists public.drop_interest_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  drop_slug text not null,
  drop_title text not null,
  full_name text not null,
  email text not null,
  country text not null,
  preferred_format text not null,
  quantity integer not null check (quantity between 1 and 10),
  shipping_address text,
  note text,
  source_path text,
  consent_contact boolean not null default true,
  status text not null default 'new' check (
    status in ('new', 'contacted', 'payment_link_sent', 'converted', 'cancelled')
  )
);

create index if not exists drop_interest_requests_drop_slug_idx
  on public.drop_interest_requests (drop_slug);

create index if not exists drop_interest_requests_created_at_idx
  on public.drop_interest_requests (created_at desc);

create index if not exists drop_interest_requests_status_idx
  on public.drop_interest_requests (status);

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
