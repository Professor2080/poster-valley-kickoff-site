-- A1 additive foundation. Apply only after review, first to the staging project.
create type public.admin_role as enum ('operator', 'manager');

create table public.admin_roles (
  user_id uuid primary key references auth.users(id) on delete restrict,
  role public.admin_role not null,
  granted_at timestamptz not null default now(),
  granted_by uuid references auth.users(id) on delete set null,
  revoked_at timestamptz,
  check ((revoked_at is null) or (revoked_at >= granted_at))
);

create index admin_roles_active_role_idx on public.admin_roles (role, user_id)
  where revoked_at is null;

create table public.admin_audit_events (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null check (action ~ '^[a-z][a-z0-9_.-]{2,99}$'),
  entity_type text not null check (entity_type ~ '^[a-z][a-z0-9_.-]{1,99}$'),
  entity_id text not null,
  correlation_id uuid,
  idempotency_key text,
  details jsonb not null default '{}'::jsonb,
  check (jsonb_typeof(details) = 'object')
);
create index admin_audit_events_entity_timeline_idx on public.admin_audit_events (entity_type, entity_id, occurred_at desc);
create index admin_audit_events_actor_date_idx on public.admin_audit_events (actor_user_id, occurred_at desc);
create unique index admin_audit_events_idempotency_idx on public.admin_audit_events (actor_user_id, action, idempotency_key)
  where idempotency_key is not null;

create table public.entity_events (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  actor_user_id uuid references auth.users(id) on delete set null,
  source text not null check (source in ('system', 'admin', 'provider')),
  event_type text not null check (event_type ~ '^[a-z][a-z0-9_.-]{2,99}$'),
  entity_type text not null check (entity_type ~ '^[a-z][a-z0-9_.-]{1,99}$'),
  entity_id text not null,
  correlation_id uuid,
  idempotency_key text,
  payload jsonb not null default '{}'::jsonb,
  check (jsonb_typeof(payload) = 'object')
);
create index entity_events_timeline_idx on public.entity_events (entity_type, entity_id, occurred_at desc);
create index entity_events_actor_date_idx on public.entity_events (actor_user_id, occurred_at desc);
create unique index entity_events_idempotency_idx on public.entity_events (source, event_type, entity_type, entity_id, idempotency_key)
  where idempotency_key is not null;

create table public.product_registry (
  product_code text primary key check (product_code ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  title text not null,
  lifecycle_status text not null check (lifecycle_status in ('draft', 'active', 'retired')),
  selling_mode text not null check (selling_mode in ('custom_drop', 'woocommerce')),
  woo_product_id text,
  woo_product_url text check (woo_product_url is null or woo_product_url ~ '^https://'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((selling_mode = 'woocommerce') or (woo_product_id is null and woo_product_url is null))
);
create index product_registry_active_idx on public.product_registry (lifecycle_status, product_code);
insert into public.product_registry (product_code, title, lifecycle_status, selling_mode)
values ('eurofighter-typhoon-a2', 'Eurofighter Typhoon / A2', 'active', 'custom_drop')
on conflict (product_code) do nothing;

-- Product codes and event history are append-only identifiers/history, not browser-owned state.
create function public.prevent_protected_history_mutation() returns trigger language plpgsql as $$
begin
  raise exception 'protected history is append-only';
end;
$$;
create trigger admin_audit_events_no_update before update or delete on public.admin_audit_events
  for each row execute function public.prevent_protected_history_mutation();
create trigger entity_events_no_update before update or delete on public.entity_events
  for each row execute function public.prevent_protected_history_mutation();
create function public.prevent_product_code_change() returns trigger language plpgsql as $$
begin
  if new.product_code <> old.product_code then raise exception 'product_code is immutable'; end if;
  return new;
end;
$$;
create trigger product_registry_code_immutable before update on public.product_registry
  for each row execute function public.prevent_product_code_change();

alter table public.admin_roles enable row level security;
alter table public.admin_audit_events enable row level security;
alter table public.entity_events enable row level security;
alter table public.product_registry enable row level security;
-- No INSERT/UPDATE/DELETE policies: browser clients are denied by default.
create policy admin_roles_read_own on public.admin_roles for select to authenticated
  using (user_id = auth.uid() and revoked_at is null);
create policy product_registry_read_authenticated on public.product_registry for select to authenticated
  using (true);
