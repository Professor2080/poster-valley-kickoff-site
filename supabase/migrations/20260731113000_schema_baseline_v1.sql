-- Poster Valley canonical Schema Baseline v1 candidate.
-- Derived only from supabase/schema.sql, the six migrations on main,
-- current application callers, and the recorded read-only Production inventory.
-- This candidate creates the final application schema from an empty Supabase public schema.

begin;
set local search_path = pg_catalog, public, extensions;
create type public.admin_role as enum ('operator', 'manager');
create type public.record_origin as enum ('customer', 'test', 'internal_pilot');
create table public.admin_audit_events (
  id uuid default gen_random_uuid() not null,
  occurred_at timestamp with time zone default now() not null,
  actor_user_id uuid,
  action text not null,
  entity_type text not null,
  entity_id text not null,
  correlation_id uuid,
  idempotency_key text,
  details jsonb default '{}'::jsonb not null
);
create table public.admin_operation_idempotency (
  actor_user_id uuid not null,
  action text not null,
  idempotency_key text not null,
  request_hash text not null,
  result jsonb,
  created_at timestamp with time zone default now() not null,
  completed_at timestamp with time zone
);
create table public.admin_roles (
  user_id uuid not null,
  role public.admin_role not null,
  granted_at timestamp with time zone default now() not null,
  granted_by uuid,
  revoked_at timestamp with time zone
);
create table public.drop_interest_requests (
  id uuid default gen_random_uuid() not null,
  created_at timestamp with time zone default now() not null,
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
  quantity integer not null,
  shipping_address text,
  note text,
  source_path text,
  consent_contact boolean default true not null,
  accepted_reservation_terms boolean default true not null,
  marketing_opt_in boolean default false not null,
  reservation_token uuid default gen_random_uuid() not null,
  reservation_status text default 'new'::text not null,
  status text default 'new'::text not null,
  metadata jsonb default '{}'::jsonb not null,
  record_origin public.record_origin default 'customer'::record_origin not null,
  record_origin_needs_review boolean default false not null,
  record_origin_version bigint default 0 not null
);
create table public.email_delivery_events (
  id uuid default gen_random_uuid() not null,
  occurred_at timestamp with time zone default now() not null,
  actor_user_id uuid,
  attempt_id uuid not null,
  entity_type text not null,
  entity_id text not null,
  template text not null,
  template_version text default 'v1'::text not null,
  delivery_status text not null,
  provider_id text,
  correlation_id uuid not null,
  details jsonb default '{}'::jsonb not null
);
create table public.entity_events (
  id uuid default gen_random_uuid() not null,
  occurred_at timestamp with time zone default now() not null,
  actor_user_id uuid,
  source text not null,
  event_type text not null,
  entity_type text not null,
  entity_id text not null,
  correlation_id uuid,
  idempotency_key text,
  payload jsonb default '{}'::jsonb not null
);
create table public.manual_shipping_quotes (
  id uuid default gen_random_uuid() not null,
  invitation_id uuid not null,
  country_code text not null,
  shipping_amount numeric(10,2) not null,
  currency text default 'EUR'::text not null,
  expires_at timestamp with time zone not null,
  status text default 'approved'::text not null,
  approved_by uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);
create table public.newsletter_signups (
  id uuid default gen_random_uuid() not null,
  created_at timestamp with time zone default now() not null,
  email text not null,
  email_normalized text generated always as (lower(email)) stored,
  source_path text,
  consent_newsletter boolean default true not null,
  status text default 'active'::text not null
);
create table public.operational_email_attempts (
  id uuid default gen_random_uuid() not null,
  actor_user_id uuid not null,
  action text not null,
  idempotency_key text not null,
  template text not null,
  template_version text default 'v1'::text not null,
  entity_type text not null,
  entity_id text not null,
  token_hash text,
  expires_at timestamp with time zone,
  delivery_status text default 'pending'::text not null,
  provider_id text,
  dispatch_claim_id uuid,
  dispatch_lease_expires_at timestamp with time zone,
  dispatch_started_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  completed_at timestamp with time zone,
  interest_request_id uuid
);
create table public.order_invitations (
  id uuid default gen_random_uuid() not null,
  interest_request_id uuid,
  drop_id text not null,
  drop_slug text not null,
  drop_title text not null,
  email text not null,
  email_normalized text not null,
  first_name text,
  last_name text,
  quantity integer not null,
  currency text default 'EUR'::text not null,
  unit_price numeric(10,2) not null,
  subtotal_amount numeric(10,2) not null,
  status text default 'draft'::text not null,
  token_hash text not null,
  expires_at timestamp with time zone,
  sent_at timestamp with time zone,
  opened_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  metadata jsonb default '{}'::jsonb not null,
  previous_token_hash text,
  previous_token_expires_at timestamp with time zone
);
create table public.orders (
  id uuid default gen_random_uuid() not null,
  invitation_id uuid not null,
  interest_request_id uuid,
  drop_id text not null,
  drop_slug text not null,
  drop_title text not null,
  status text default 'draft'::text not null,
  email text not null,
  first_name text not null,
  last_name text not null,
  quantity integer not null,
  currency text default 'EUR'::text not null,
  unit_price numeric(10,2) not null,
  subtotal_amount numeric(10,2) not null,
  shipping_amount numeric(10,2) not null,
  total_amount numeric(10,2) not null,
  shipping_profile_id text not null,
  shipping_country text not null,
  shipping_country_code text not null,
  shipping_name text not null,
  address_line1 text not null,
  address_line2 text,
  postal_code text not null,
  city text not null,
  region text,
  accepted_terms_at timestamp with time zone not null,
  customer_confirmation_sent_at timestamp with time zone,
  internal_paid_notification_sent_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  metadata jsonb default '{}'::jsonb not null,
  fulfilment_status text default 'unfulfilled'::text not null,
  fulfilment_version bigint default 0 not null,
  carrier text,
  tracking_number text,
  shipped_at timestamp with time zone,
  shipping_email_status text default 'not_prepared'::text not null,
  manual_shipping_quote_id uuid,
  shipping_company text,
  payment_request_hash text not null,
  payment_provider_idempotency_key uuid default gen_random_uuid() not null,
  payment_start_status text not null,
  payment_claim_id uuid,
  payment_claim_expires_at timestamp with time zone,
  payment_provider_started_at timestamp with time zone,
  payment_reconciliation_required_at timestamp with time zone
);
create table public.payments (
  id uuid default gen_random_uuid() not null,
  order_id uuid not null,
  provider text default 'mollie'::text not null,
  provider_payment_id text not null,
  status text default 'created'::text not null,
  amount numeric(10,2) not null,
  currency text default 'EUR'::text not null,
  checkout_url text,
  redirect_url text,
  webhook_received_at timestamp with time zone,
  paid_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  metadata jsonb default '{}'::jsonb not null
);
create table public.product_registry (
  product_code text not null,
  title text not null,
  lifecycle_mode text not null,
  commerce_authority text generated always as (
CASE lifecycle_mode
    WHEN 'interest'::text THEN 'custom'::text
    WHEN 'preorder'::text THEN 'custom'::text
    WHEN 'in_stock'::text THEN 'woocommerce'::text
    WHEN 'sold_out'::text THEN 'none'::text
    WHEN 'archived'::text THEN 'historical'::text
    ELSE NULL::text
END) stored,
  woo_product_id text,
  woo_product_url text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);
alter table public.admin_audit_events add constraint admin_audit_events_action_check CHECK (action ~ '^[a-z][a-z0-9_.-]{2,99}$'::text);
alter table public.admin_audit_events add constraint admin_audit_events_details_check CHECK (jsonb_typeof(details) = 'object'::text);
alter table public.admin_audit_events add constraint admin_audit_events_entity_type_check CHECK (entity_type ~ '^[a-z][a-z0-9_.-]{1,99}$'::text);
alter table public.admin_operation_idempotency add constraint admin_operation_idempotency_request_hash_check CHECK (request_hash ~ '^[a-f0-9]{64}$'::text);
alter table public.admin_roles add constraint admin_roles_check CHECK (revoked_at IS NULL OR revoked_at >= granted_at);
alter table public.drop_interest_requests add constraint drop_interest_requests_quantity_check CHECK (quantity >= 1 AND quantity <= 10);
alter table public.drop_interest_requests add constraint drop_interest_requests_record_origin_version_check CHECK (record_origin_version >= 0);
alter table public.drop_interest_requests add constraint drop_interest_requests_reservation_status_check CHECK (reservation_status = ANY (ARRAY['new'::text, 'contacted'::text, 'order_invited'::text, 'converted'::text, 'cancelled'::text]));
alter table public.drop_interest_requests add constraint drop_interest_requests_status_check CHECK (status = ANY (ARRAY['new'::text, 'contacted'::text, 'payment_link_sent'::text, 'converted'::text, 'cancelled'::text]));
alter table public.email_delivery_events add constraint email_delivery_events_delivery_status_check CHECK (delivery_status = ANY (ARRAY['suppressed'::text, 'sent'::text, 'failed'::text]));
alter table public.email_delivery_events add constraint email_delivery_events_details_check CHECK (jsonb_typeof(details) = 'object'::text);
alter table public.entity_events add constraint entity_events_entity_type_check CHECK (entity_type ~ '^[a-z][a-z0-9_.-]{1,99}$'::text);
alter table public.entity_events add constraint entity_events_event_type_check CHECK (event_type ~ '^[a-z][a-z0-9_.-]{2,99}$'::text);
alter table public.entity_events add constraint entity_events_payload_check CHECK (jsonb_typeof(payload) = 'object'::text);
alter table public.entity_events add constraint entity_events_source_check CHECK (source = ANY (ARRAY['system'::text, 'admin'::text, 'provider'::text]));
alter table public.manual_shipping_quotes add constraint manual_shipping_quotes_country_code_check CHECK (country_code ~ '^[A-Z]{2}$'::text);
alter table public.manual_shipping_quotes add constraint manual_shipping_quotes_currency_check CHECK (currency ~ '^[A-Z]{3}$'::text);
alter table public.manual_shipping_quotes add constraint manual_shipping_quotes_shipping_amount_check CHECK (shipping_amount >= 0::numeric);
alter table public.manual_shipping_quotes add constraint manual_shipping_quotes_status_check CHECK (status = ANY (ARRAY['approved'::text, 'expired'::text, 'cancelled'::text]));
alter table public.newsletter_signups add constraint newsletter_signups_status_check CHECK (status = ANY (ARRAY['active'::text, 'unsubscribed'::text]));
alter table public.operational_email_attempts add constraint operational_email_attempts_delivery_status_check CHECK (delivery_status = ANY (ARRAY['pending'::text, 'suppressed'::text, 'sent'::text, 'failed'::text]));
alter table public.operational_email_attempts add constraint operational_email_attempts_template_check CHECK (template = ANY (ARRAY['order_invitation'::text, 'shipping_confirmation'::text]));
alter table public.order_invitations add constraint order_invitations_previous_token_hash_check CHECK (previous_token_hash IS NULL OR previous_token_hash ~ '^[a-f0-9]{64}$'::text);
alter table public.order_invitations add constraint order_invitations_quantity_check CHECK (quantity >= 1 AND quantity <= 10);
alter table public.order_invitations add constraint order_invitations_status_check CHECK (status = ANY (ARRAY['draft'::text, 'sent'::text, 'opened'::text, 'order_started'::text, 'payment_open'::text, 'paid'::text, 'expired'::text, 'cancelled'::text]));
alter table public.orders add constraint orders_fulfilment_status_check CHECK (fulfilment_status = ANY (ARRAY['unfulfilled'::text, 'ready_to_pack'::text, 'packed'::text, 'shipped'::text]));
alter table public.orders add constraint orders_fulfilment_version_check CHECK (fulfilment_version >= 0);
alter table public.orders add constraint orders_quantity_check CHECK (quantity >= 1 AND quantity <= 10);
alter table public.orders add constraint orders_payment_request_hash_check CHECK (payment_request_hash ~ '^[a-f0-9]{64}$'::text);
alter table public.orders add constraint orders_payment_start_state_check CHECK (
  (payment_start_status = 'claimed'::text AND payment_claim_id IS NOT NULL AND payment_claim_expires_at IS NOT NULL AND payment_provider_started_at IS NULL AND payment_reconciliation_required_at IS NULL)
  OR (payment_start_status = 'provider_pending'::text AND payment_claim_id IS NOT NULL AND payment_claim_expires_at IS NULL AND payment_provider_started_at IS NOT NULL AND payment_reconciliation_required_at IS NULL)
  OR (payment_start_status = 'provider_created'::text AND payment_claim_id IS NULL AND payment_claim_expires_at IS NULL AND payment_provider_started_at IS NOT NULL AND payment_reconciliation_required_at IS NULL)
  OR (payment_start_status = 'reconciliation_required'::text AND payment_claim_id IS NULL AND payment_claim_expires_at IS NULL AND payment_provider_started_at IS NOT NULL AND payment_reconciliation_required_at IS NOT NULL)
);
alter table public.orders add constraint orders_shipped_details_check CHECK (fulfilment_status <> 'shipped'::text OR NULLIF(btrim(carrier), ''::text) IS NOT NULL AND length(carrier) <= 120 AND NULLIF(btrim(tracking_number), ''::text) IS NOT NULL AND length(tracking_number) <= 160 AND shipped_at IS NOT NULL);
alter table public.orders add constraint orders_shipping_company_check CHECK (shipping_company IS NULL OR length(shipping_company) <= 160);
alter table public.orders add constraint orders_shipping_email_status_check CHECK (shipping_email_status = ANY (ARRAY['not_prepared'::text, 'pending'::text, 'suppressed'::text, 'sent'::text, 'failed'::text]));
alter table public.orders add constraint orders_status_check CHECK (status = ANY (ARRAY['draft'::text, 'awaiting_payment'::text, 'payment_open'::text, 'paid'::text, 'payment_failed'::text, 'payment_expired'::text, 'cancelled'::text, 'shipped'::text]));
alter table public.payments add constraint payments_status_check CHECK (status = ANY (ARRAY['created'::text, 'open'::text, 'paid'::text, 'failed'::text, 'expired'::text, 'canceled'::text, 'unknown'::text]));
alter table public.product_registry add constraint product_registry_check CHECK (lifecycle_mode = 'in_stock'::text OR woo_product_id IS NULL AND woo_product_url IS NULL);
alter table public.product_registry add constraint product_registry_lifecycle_mode_check CHECK (lifecycle_mode = ANY (ARRAY['interest'::text, 'preorder'::text, 'in_stock'::text, 'sold_out'::text, 'archived'::text]));
alter table public.product_registry add constraint product_registry_product_code_check CHECK (product_code ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'::text);
alter table public.product_registry add constraint product_registry_woo_product_url_check CHECK (woo_product_url IS NULL OR woo_product_url ~ '^https://'::text);
alter table public.admin_audit_events add constraint admin_audit_events_pkey PRIMARY KEY (id);
alter table public.admin_operation_idempotency add constraint admin_operation_idempotency_pkey PRIMARY KEY (actor_user_id, action, idempotency_key);
alter table public.admin_roles add constraint admin_roles_pkey PRIMARY KEY (user_id);
alter table public.drop_interest_requests add constraint drop_interest_requests_pkey PRIMARY KEY (id);
alter table public.email_delivery_events add constraint email_delivery_events_pkey PRIMARY KEY (id);
alter table public.entity_events add constraint entity_events_pkey PRIMARY KEY (id);
alter table public.manual_shipping_quotes add constraint manual_shipping_quotes_pkey PRIMARY KEY (id);
alter table public.newsletter_signups add constraint newsletter_signups_pkey PRIMARY KEY (id);
alter table public.operational_email_attempts add constraint operational_email_attempts_pkey PRIMARY KEY (id);
alter table public.order_invitations add constraint order_invitations_pkey PRIMARY KEY (id);
alter table public.orders add constraint orders_pkey PRIMARY KEY (id);
alter table public.payments add constraint payments_pkey PRIMARY KEY (id);
alter table public.product_registry add constraint product_registry_pkey PRIMARY KEY (product_code);
alter table public.email_delivery_events add constraint email_delivery_events_attempt_id_key UNIQUE (attempt_id);
alter table public.newsletter_signups add constraint newsletter_signups_email_normalized_key UNIQUE (email_normalized);
alter table public.operational_email_attempts add constraint operational_email_attempts_actor_user_id_action_idempotency_key UNIQUE (actor_user_id, action, idempotency_key);
alter table public.order_invitations add constraint order_invitations_token_hash_key UNIQUE (token_hash);
alter table public.orders add constraint orders_invitation_id_key UNIQUE (invitation_id);
alter table public.orders add constraint orders_payment_provider_idempotency_key_key UNIQUE (payment_provider_idempotency_key);
alter table public.payments add constraint payments_order_id_provider_key UNIQUE (order_id, provider);
alter table public.payments add constraint payments_provider_payment_id_key UNIQUE (provider_payment_id);
alter table public.admin_audit_events add constraint admin_audit_events_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.admin_operation_idempotency add constraint admin_operation_idempotency_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES auth.users(id);
alter table public.admin_roles add constraint admin_roles_granted_by_fkey FOREIGN KEY (granted_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.admin_roles add constraint admin_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE RESTRICT;
alter table public.email_delivery_events add constraint email_delivery_events_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.email_delivery_events add constraint email_delivery_events_attempt_id_fkey FOREIGN KEY (attempt_id) REFERENCES operational_email_attempts(id) ON DELETE RESTRICT;
alter table public.entity_events add constraint entity_events_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.manual_shipping_quotes add constraint manual_shipping_quotes_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.manual_shipping_quotes add constraint manual_shipping_quotes_invitation_id_fkey FOREIGN KEY (invitation_id) REFERENCES order_invitations(id) ON DELETE CASCADE;
alter table public.operational_email_attempts add constraint operational_email_attempts_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES auth.users(id);
alter table public.operational_email_attempts add constraint operational_email_attempts_interest_request_id_fkey FOREIGN KEY (interest_request_id) REFERENCES drop_interest_requests(id) ON DELETE SET NULL;
alter table public.order_invitations add constraint order_invitations_interest_request_id_fkey FOREIGN KEY (interest_request_id) REFERENCES drop_interest_requests(id) ON DELETE SET NULL;
alter table public.orders add constraint orders_interest_request_id_fkey FOREIGN KEY (interest_request_id) REFERENCES drop_interest_requests(id) ON DELETE SET NULL;
alter table public.orders add constraint orders_invitation_id_fkey FOREIGN KEY (invitation_id) REFERENCES order_invitations(id) ON DELETE CASCADE;
alter table public.orders add constraint orders_manual_shipping_quote_id_fkey FOREIGN KEY (manual_shipping_quote_id) REFERENCES manual_shipping_quotes(id) ON DELETE RESTRICT;
alter table public.payments add constraint payments_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;
CREATE INDEX admin_audit_events_actor_date_idx ON public.admin_audit_events USING btree (actor_user_id, occurred_at DESC);
CREATE INDEX admin_audit_events_entity_timeline_idx ON public.admin_audit_events USING btree (entity_type, entity_id, occurred_at DESC);
CREATE UNIQUE INDEX admin_audit_events_idempotency_idx ON public.admin_audit_events USING btree (actor_user_id, action, idempotency_key) WHERE (idempotency_key IS NOT NULL);
CREATE INDEX admin_roles_active_role_idx ON public.admin_roles USING btree (role, user_id) WHERE (revoked_at IS NULL);
CREATE INDEX admin_roles_granted_by_idx ON public.admin_roles USING btree (granted_by) WHERE (granted_by IS NOT NULL);
CREATE INDEX drop_interest_requests_created_at_idx ON public.drop_interest_requests USING btree (created_at DESC);
CREATE INDEX drop_interest_requests_drop_slug_idx ON public.drop_interest_requests USING btree (drop_slug);
CREATE INDEX drop_interest_requests_email_normalized_idx ON public.drop_interest_requests USING btree (email_normalized);
CREATE INDEX drop_interest_requests_origin_idx ON public.drop_interest_requests USING btree (record_origin, record_origin_needs_review, created_at DESC);
CREATE INDEX drop_interest_requests_reservation_status_idx ON public.drop_interest_requests USING btree (reservation_status);
CREATE INDEX drop_interest_requests_status_idx ON public.drop_interest_requests USING btree (status);
CREATE INDEX email_delivery_events_actor_user_id_idx ON public.email_delivery_events USING btree (actor_user_id);
CREATE INDEX email_delivery_events_entity_idx ON public.email_delivery_events USING btree (entity_type, entity_id, occurred_at DESC);
CREATE INDEX entity_events_actor_date_idx ON public.entity_events USING btree (actor_user_id, occurred_at DESC);
CREATE UNIQUE INDEX entity_events_idempotency_idx ON public.entity_events USING btree (source, event_type, entity_type, entity_id, idempotency_key) WHERE (idempotency_key IS NOT NULL);
CREATE INDEX entity_events_timeline_idx ON public.entity_events USING btree (entity_type, entity_id, occurred_at DESC);
CREATE INDEX manual_shipping_quotes_approved_by_idx ON public.manual_shipping_quotes USING btree (approved_by);
CREATE INDEX manual_shipping_quotes_invitation_idx ON public.manual_shipping_quotes USING btree (invitation_id, created_at DESC);
CREATE UNIQUE INDEX manual_shipping_quotes_one_active_idx ON public.manual_shipping_quotes USING btree (invitation_id) WHERE (status = 'approved'::text);
CREATE INDEX newsletter_signups_created_at_idx ON public.newsletter_signups USING btree (created_at DESC);
CREATE INDEX newsletter_signups_status_idx ON public.newsletter_signups USING btree (status);
CREATE INDEX operational_email_attempts_interest_request_idx ON public.operational_email_attempts USING btree (interest_request_id, created_at DESC);
CREATE UNIQUE INDEX operational_email_one_pending_entity_idx ON public.operational_email_attempts USING btree (template, entity_type, entity_id) WHERE (delivery_status = 'pending'::text);
CREATE INDEX order_invitations_created_at_idx ON public.order_invitations USING btree (created_at DESC);
CREATE INDEX order_invitations_interest_request_id_idx ON public.order_invitations USING btree (interest_request_id);
CREATE INDEX order_invitations_previous_token_hash_idx ON public.order_invitations USING btree (previous_token_hash) WHERE (previous_token_hash IS NOT NULL);
CREATE INDEX order_invitations_status_idx ON public.order_invitations USING btree (status);
CREATE INDEX order_invitations_token_hash_idx ON public.order_invitations USING btree (token_hash);
CREATE INDEX orders_created_at_idx ON public.orders USING btree (created_at DESC);
CREATE INDEX orders_fulfilment_status_idx ON public.orders USING btree (fulfilment_status, updated_at DESC);
CREATE INDEX orders_interest_request_id_idx ON public.orders USING btree (interest_request_id);
CREATE INDEX orders_manual_quote_idx ON public.orders USING btree (manual_shipping_quote_id) WHERE (manual_shipping_quote_id IS NOT NULL);
CREATE INDEX orders_status_idx ON public.orders USING btree (status);
CREATE INDEX payments_provider_payment_id_idx ON public.payments USING btree (provider_payment_id);
CREATE INDEX payments_status_idx ON public.payments USING btree (status);
CREATE INDEX product_registry_lifecycle_idx ON public.product_registry USING btree (lifecycle_mode, product_code);
CREATE OR REPLACE FUNCTION public.prevent_protected_history_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  raise exception 'protected history is append-only';
end;
$function$
;
CREATE OR REPLACE FUNCTION public.prevent_product_code_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if new.product_code <> old.product_code then raise exception 'product_code is immutable'; end if;
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.validate_order_manual_quote()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare q public.manual_shipping_quotes;
begin
  if new.manual_shipping_quote_id is null then return new; end if;
  perform 1 from public.order_invitations where id = new.invitation_id for share;
  select * into q from public.manual_shipping_quotes where id = new.manual_shipping_quote_id for share;
  if not found or q.invitation_id <> new.invitation_id or q.status <> 'approved' or q.expires_at <= now()
     or q.country_code <> new.shipping_country_code or q.currency <> new.currency
     or q.shipping_amount <> new.shipping_amount then
    raise exception using message = 'invalid_manual_quote', errcode = 'P0001';
  end if;
  return new;
end $function$
;
CREATE OR REPLACE FUNCTION public.payment_start_claim(p_invitation_id uuid, p_request_hash text, p_claim_id uuid, p_order jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  i public.order_invitations;
  o public.orders;
  pay public.payments;
  now_at timestamptz := pg_catalog.now();
  owns_claim boolean := false;
begin
  if p_request_hash !~ '^[a-f0-9]{64}$' or p_claim_id is null or pg_catalog.jsonb_typeof(p_order) <> 'object' then
    raise exception using message='payment_state_conflict', errcode='P0001';
  end if;

  select * into i from public.order_invitations where id=p_invitation_id for update;
  if not found then raise exception using message='payment_invitation_not_found', errcode='P0001'; end if;
  if i.expires_at is not null and i.expires_at <= now_at then
    raise exception using message='payment_invitation_expired', errcode='P0001';
  end if;

  select * into o from public.orders where invitation_id=i.id for update;
  if found then
    if o.payment_request_hash <> p_request_hash then
      raise exception using message='payment_idempotency_conflict', errcode='P0001';
    end if;

    select * into pay from public.payments where order_id=o.id and provider='mollie' for update;
    if found then
      return pg_catalog.jsonb_build_object(
        'orderId',o.id,'providerIdempotencyKey',o.payment_provider_idempotency_key,
        'paymentStartStatus',o.payment_start_status,'claimOwner',false,
        'paymentStatus',pay.status,'checkoutUrl',pay.checkout_url
      );
    end if;

    if i.status not in ('draft','sent','opened','order_started','payment_open') then
      raise exception using message='payment_invitation_unusable', errcode='P0001';
    end if;

    if o.payment_start_status='claimed' then
      if o.payment_claim_id=p_claim_id then
        owns_claim := true;
      elsif o.payment_claim_expires_at <= now_at then
        update public.orders set payment_claim_id=p_claim_id,
          payment_claim_expires_at=now_at+interval '2 minutes',updated_at=now_at
          where id=o.id returning * into o;
        owns_claim := true;
      end if;
    elsif o.payment_start_status='provider_created' then
      raise exception using message='payment_state_conflict', errcode='P0001';
    end if;

    return pg_catalog.jsonb_build_object(
      'orderId',o.id,'providerIdempotencyKey',o.payment_provider_idempotency_key,
      'paymentStartStatus',o.payment_start_status,'claimOwner',owns_claim,
      'paymentStatus',null,'checkoutUrl',null
    );
  end if;

  if i.status not in ('draft','sent','opened','order_started','payment_open') then
    raise exception using message='payment_invitation_unusable', errcode='P0001';
  end if;

  insert into public.orders(
    invitation_id,interest_request_id,drop_id,drop_slug,drop_title,status,
    email,first_name,last_name,quantity,currency,unit_price,subtotal_amount,
    shipping_amount,total_amount,shipping_profile_id,manual_shipping_quote_id,
    shipping_country,shipping_country_code,shipping_name,shipping_company,
    address_line1,address_line2,postal_code,city,region,accepted_terms_at,metadata,
    payment_request_hash,payment_start_status,payment_claim_id,payment_claim_expires_at
  ) values (
    i.id,(p_order->>'interest_request_id')::uuid,p_order->>'drop_id',p_order->>'drop_slug',p_order->>'drop_title','awaiting_payment',
    p_order->>'email',p_order->>'first_name',p_order->>'last_name',(p_order->>'quantity')::integer,p_order->>'currency',
    (p_order->>'unit_price')::numeric,(p_order->>'subtotal_amount')::numeric,(p_order->>'shipping_amount')::numeric,
    (p_order->>'total_amount')::numeric,p_order->>'shipping_profile_id',nullif(p_order->>'manual_shipping_quote_id','')::uuid,
    p_order->>'shipping_country',p_order->>'shipping_country_code',p_order->>'shipping_name',nullif(p_order->>'shipping_company',''),
    p_order->>'address_line1',nullif(p_order->>'address_line2',''),p_order->>'postal_code',p_order->>'city',nullif(p_order->>'region',''),
    (p_order->>'accepted_terms_at')::timestamptz,coalesce(p_order->'metadata','{}'::jsonb),
    p_request_hash,'claimed',p_claim_id,now_at+interval '2 minutes'
  ) returning * into o;

  update public.order_invitations set status='order_started',updated_at=now_at where id=i.id;

  return pg_catalog.jsonb_build_object(
    'orderId',o.id,'providerIdempotencyKey',o.payment_provider_idempotency_key,
    'paymentStartStatus',o.payment_start_status,'claimOwner',true,
    'paymentStatus',null,'checkoutUrl',null
  );
end $function$
;
CREATE OR REPLACE FUNCTION public.payment_start_begin_provider(p_order_id uuid, p_request_hash text, p_claim_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_invitation_id uuid;
  i public.order_invitations;
  o public.orders;
  pay public.payments;
  now_at timestamptz := pg_catalog.now();
begin
  select existing.invitation_id into v_invitation_id from public.orders existing where existing.id=p_order_id;
  if not found then raise exception using message='payment_state_conflict', errcode='P0001'; end if;
  select * into i from public.order_invitations where id=v_invitation_id for update;
  select * into o from public.orders where id=p_order_id for update;

  if o.payment_request_hash <> p_request_hash then
    raise exception using message='payment_idempotency_conflict', errcode='P0001';
  end if;

  select * into pay from public.payments where order_id=o.id and provider='mollie' for update;
  if found then
    return pg_catalog.jsonb_build_object(
      'started',false,'orderId',o.id,'paymentStartStatus',o.payment_start_status,'claimOwner',false,
      'paymentStatus',pay.status,'checkoutUrl',pay.checkout_url
    );
  end if;

  if i.expires_at is not null and i.expires_at <= now_at then
    raise exception using message='payment_invitation_expired', errcode='P0001';
  end if;
  if i.status not in ('draft','sent','opened','order_started','payment_open') then
    raise exception using message='payment_invitation_unusable', errcode='P0001';
  end if;

  if o.payment_start_status <> 'claimed' or o.payment_claim_id is distinct from p_claim_id
     or o.payment_claim_expires_at <= now_at then
    if o.payment_start_status in ('provider_pending','reconciliation_required') then
      return pg_catalog.jsonb_build_object(
        'started',false,'orderId',o.id,'paymentStartStatus',o.payment_start_status,'claimOwner',false,
        'paymentStatus',null,'checkoutUrl',null
      );
    end if;
    raise exception using message='payment_claim_lost', errcode='P0001';
  end if;

  update public.orders set payment_start_status='provider_pending',payment_claim_expires_at=null,
    payment_provider_started_at=now_at,updated_at=now_at where id=o.id returning * into o;

  return pg_catalog.jsonb_build_object(
    'started',true,'orderId',o.id,'providerIdempotencyKey',o.payment_provider_idempotency_key,
    'paymentStartStatus',o.payment_start_status,'claimOwner',true,'paymentStatus',null,'checkoutUrl',null
  );
end $function$
;
CREATE OR REPLACE FUNCTION public.payment_start_complete(
  p_order_id uuid,p_request_hash text,p_claim_id uuid,p_provider_payment_id text,
  p_payment_status text,p_amount numeric,p_currency text,p_checkout_url text,
  p_redirect_url text,p_metadata jsonb
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_invitation_id uuid;
  i public.order_invitations;
  o public.orders;
  pay public.payments;
  now_at timestamptz := pg_catalog.now();
  next_order_status text;
  next_invitation_status text;
begin
  if p_provider_payment_id !~ '^tr_[A-Za-z0-9]+$' or length(p_provider_payment_id)>200
     or p_payment_status not in ('created','open','paid','failed','expired','canceled','unknown')
     or p_amount <= 0 or p_currency !~ '^[A-Z]{3}$' or pg_catalog.jsonb_typeof(p_metadata) <> 'object' then
    raise exception using message='payment_result_conflict', errcode='P0001';
  end if;

  select existing.invitation_id into v_invitation_id from public.orders existing where existing.id=p_order_id;
  if not found then raise exception using message='payment_state_conflict', errcode='P0001'; end if;
  select * into i from public.order_invitations where id=v_invitation_id for update;
  select * into o from public.orders where id=p_order_id for update;

  if o.payment_request_hash <> p_request_hash then
    raise exception using message='payment_idempotency_conflict', errcode='P0001';
  end if;

  select * into pay from public.payments where order_id=o.id and provider='mollie' for update;
  if found then
    if pay.provider_payment_id <> p_provider_payment_id or pay.amount <> p_amount or pay.currency <> p_currency then
      raise exception using message='payment_result_conflict', errcode='P0001';
    end if;
    return pg_catalog.jsonb_build_object(
      'orderId',o.id,'paymentStartStatus',o.payment_start_status,'claimOwner',false,
      'paymentStatus',pay.status,'checkoutUrl',pay.checkout_url
    );
  end if;

  if o.payment_start_status <> 'provider_pending' or o.payment_claim_id is distinct from p_claim_id then
    raise exception using message='payment_state_conflict', errcode='P0001';
  end if;

  insert into public.payments(
    order_id,provider,provider_payment_id,status,amount,currency,checkout_url,redirect_url,metadata
  ) values (
    o.id,'mollie',p_provider_payment_id,p_payment_status,p_amount,p_currency,p_checkout_url,p_redirect_url,p_metadata
  ) returning * into pay;

  next_order_status := case p_payment_status
    when 'paid' then 'paid'
    when 'failed' then 'payment_failed'
    when 'expired' then 'payment_expired'
    when 'canceled' then 'cancelled'
    when 'open' then 'payment_open'
    else 'awaiting_payment'
  end;
  next_invitation_status := case p_payment_status
    when 'paid' then 'paid'
    when 'open' then 'payment_open'
    else 'order_started'
  end;

  update public.orders set status=next_order_status,payment_start_status='provider_created',
    payment_claim_id=null,payment_claim_expires_at=null,updated_at=now_at where id=o.id returning * into o;
  update public.order_invitations set status=next_invitation_status,updated_at=now_at where id=i.id;

  return pg_catalog.jsonb_build_object(
    'orderId',o.id,'paymentStartStatus',o.payment_start_status,'claimOwner',false,
    'paymentStatus',pay.status,'checkoutUrl',pay.checkout_url
  );
end $function$
;
CREATE OR REPLACE FUNCTION public.payment_start_mark_reconciliation(p_order_id uuid, p_request_hash text, p_claim_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_invitation_id uuid;
  i public.order_invitations;
  o public.orders;
  pay public.payments;
  now_at timestamptz := pg_catalog.now();
begin
  select existing.invitation_id into v_invitation_id from public.orders existing where existing.id=p_order_id;
  if not found then raise exception using message='payment_state_conflict', errcode='P0001'; end if;
  select * into i from public.order_invitations where id=v_invitation_id for update;
  select * into o from public.orders where id=p_order_id for update;

  if o.payment_request_hash <> p_request_hash then
    raise exception using message='payment_idempotency_conflict', errcode='P0001';
  end if;

  select * into pay from public.payments where order_id=o.id and provider='mollie' for update;
  if found then
    return pg_catalog.jsonb_build_object(
      'orderId',o.id,'paymentStartStatus',o.payment_start_status,'claimOwner',false,
      'paymentStatus',pay.status,'checkoutUrl',pay.checkout_url
    );
  end if;

  if o.payment_start_status <> 'provider_pending' or o.payment_claim_id is distinct from p_claim_id then
    if o.payment_start_status='reconciliation_required' then
      return pg_catalog.jsonb_build_object(
        'orderId',o.id,'paymentStartStatus',o.payment_start_status,'claimOwner',false,
        'paymentStatus',null,'checkoutUrl',null
      );
    end if;
    raise exception using message='payment_state_conflict', errcode='P0001';
  end if;

  update public.orders set status='awaiting_payment',payment_start_status='reconciliation_required',
    payment_claim_id=null,payment_claim_expires_at=null,payment_reconciliation_required_at=now_at,
    updated_at=now_at where id=o.id returning * into o;
  update public.order_invitations set status=case when status in ('paid','expired','cancelled') then status else 'order_started' end,
    updated_at=now_at where id=i.id;

  return pg_catalog.jsonb_build_object(
    'orderId',o.id,'paymentStartStatus',o.payment_start_status,'claimOwner',false,
    'paymentStatus',null,'checkoutUrl',null
  );
end $function$
;
CREATE OR REPLACE FUNCTION public.admin_a3_replay_action(p_actor uuid, p_action text, p_idempotency_key text, p_request_hash text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare prior public.admin_operation_idempotency;
begin
  if not exists(select 1 from public.admin_roles where user_id=p_actor and revoked_at is null) then raise exception using message='forbidden', errcode='P0001'; end if;
  select * into prior from public.admin_operation_idempotency
    where actor_user_id=p_actor and action=p_action and idempotency_key=p_idempotency_key;
  if not found then return jsonb_build_object('found',false); end if;
  if prior.request_hash <> p_request_hash then raise exception using message='idempotency_conflict', errcode='P0001'; end if;
  if prior.result is null then raise exception using message='operation_in_progress', errcode='P0001'; end if;
  return jsonb_build_object('found',true,'result',prior.result);
end $function$
;
CREATE OR REPLACE FUNCTION public.admin_a3_preview_action(p_actor uuid, p_action text, p_request jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare r public.drop_interest_requests; i public.order_invitations; o public.orders; pay public.payments; a public.operational_email_attempts;
begin
  if not exists (select 1 from public.admin_roles where user_id = p_actor and revoked_at is null) then raise exception using message='forbidden', errcode='P0001'; end if;
  if p_action like 'quote.%' and not exists (select 1 from public.admin_roles where user_id=p_actor and role='manager' and revoked_at is null) then raise exception using message='insufficient_role', errcode='P0001'; end if;
  if p_action like 'invitation.%' then
    select * into r from public.drop_interest_requests where id = (p_request->>'reservationId')::uuid;
    if not found then raise exception using message='not_found', errcode='P0001'; end if;
    select * into i from public.order_invitations where interest_request_id=r.id order by created_at desc limit 1;
    if p_action <> 'invitation.preview' and (r.reservation_status in ('converted','cancelled') or r.status in ('converted','cancelled')) then raise exception using message='invalid_transition', errcode='P0001'; end if;
    if p_action = 'invitation.send' and i.id is not null and i.status not in ('draft','expired') then raise exception using message='invalid_transition', errcode='P0001'; end if;
    if p_action = 'invitation.resend' and (i.id is null or i.status not in ('sent','opened')) then raise exception using message='invalid_transition', errcode='P0001'; end if;
    return jsonb_build_object('success',true,'preview',jsonb_build_object(
      'reservationId',r.id,'dropSlug',r.drop_slug,'quantity',r.quantity,'reservationStatus',r.reservation_status,
      'invitationId',i.id,'invitationStatus',i.status,'suggestedAction',case
        when r.reservation_status in ('converted','cancelled') or r.status in ('converted','cancelled') then null
        when i.status in ('sent','opened') then 'invitation.resend'
        when i.id is null or i.status in ('draft','expired') then 'invitation.send'
        else null end));
  elsif p_action like 'quote.%' then
    select * into i from public.order_invitations where id=(p_request->>'invitationId')::uuid;
    if not found then raise exception using message='not_found', errcode='P0001'; end if;
    if p_action <> 'quote.preview' and (i.status not in ('draft','sent','opened','order_started') or i.expires_at is null or i.expires_at <= now()) then raise exception using message='invalid_transition', errcode='P0001'; end if;
    if p_action <> 'quote.preview' and i.updated_at <> (p_request->>'expectedInvitationUpdatedAt')::timestamptz then raise exception using message='stale_transition', errcode='P0001'; end if;
    return jsonb_build_object('success',true,'preview',jsonb_build_object(
      'invitationId',i.id,'invitationStatus',i.status,'dropSlug',i.drop_slug,'quantity',i.quantity,
      'unitPrice',i.unit_price,'currency',i.currency,'countryCode',upper(p_request->>'countryCode'),
      'shippingAmount',(p_request->>'shippingAmount')::numeric,'expiresAt',p_request->>'expiresAt',
      'actionAllowed',i.status in ('draft','sent','opened','order_started') and i.expires_at is not null and i.expires_at > now() and i.updated_at=(p_request->>'expectedInvitationUpdatedAt')::timestamptz));
  elsif p_action like 'fulfilment.%' then
    select * into o from public.orders where id=(p_request->>'orderId')::uuid;
    if not found then raise exception using message='not_found', errcode='P0001'; end if;
    select * into pay from public.payments where order_id=o.id and provider='mollie' and status='paid'
      and provider_payment_id is not null and webhook_received_at is not null and paid_at is not null
      and amount=o.total_amount and currency=o.currency order by paid_at desc limit 1;
    if o.status <> 'paid' or pay.id is null then raise exception using message='payment_not_confirmed', errcode='P0001'; end if;
    if o.fulfilment_status <> p_request->>'expectedStatus' or o.fulfilment_version <> (p_request->>'expectedVersion')::bigint then raise exception using message='stale_transition', errcode='P0001'; end if;
    if not ((o.fulfilment_status='unfulfilled' and p_request->>'targetStatus'='ready_to_pack') or
            (o.fulfilment_status='ready_to_pack' and p_request->>'targetStatus'='packed') or
            (o.fulfilment_status='packed' and p_request->>'targetStatus'='shipped')) then raise exception using message='invalid_transition', errcode='P0001'; end if;
    return jsonb_build_object('success',true,'preview',jsonb_build_object(
      'orderId',o.id,'currentStatus',o.fulfilment_status,'targetStatus',p_request->>'targetStatus',
      'fulfilmentVersion',o.fulfilment_version,'dropTitle',o.drop_title,
      'carrier',p_request->>'carrier','trackingNumber',p_request->>'trackingNumber'));
  elsif p_action like 'shipping.%' then
    select * into o from public.orders where id=(p_request->>'orderId')::uuid;
    if not found then raise exception using message='not_found', errcode='P0001'; end if;
    select * into pay from public.payments where order_id=o.id and provider='mollie' and status='paid'
      and provider_payment_id is not null and webhook_received_at is not null and paid_at is not null
      and amount=o.total_amount and currency=o.currency order by paid_at desc limit 1;
    if o.status <> 'paid' or pay.id is null then raise exception using message='payment_not_confirmed', errcode='P0001'; end if;
    if o.fulfilment_status <> 'shipped' or nullif(btrim(o.carrier),'') is null or nullif(btrim(o.tracking_number),'') is null then raise exception using message='invalid_transition', errcode='P0001'; end if;
    select * into a from public.operational_email_attempts where template='shipping_confirmation' and entity_type='order' and entity_id=o.id::text order by created_at desc limit 1;
    if a.delivery_status='sent' then raise exception using message='invalid_transition', errcode='P0001'; end if;
    return jsonb_build_object('success',true,'preview',jsonb_build_object(
      'orderId',o.id,'fulfilmentStatus',o.fulfilment_status,'carrier',o.carrier,'trackingNumber',o.tracking_number,
      'previousDeliveryStatus',a.delivery_status,'suggestedAction','shipping.retry'));
  end if;
  raise exception using message='invalid_action', errcode='P0001';
end $function$
;
CREATE OR REPLACE FUNCTION public.admin_a3_apply_action(p_actor uuid, p_action text, p_idempotency_key text, p_request_hash text, p_request jsonb, p_context jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare prior public.admin_operation_idempotency; v_result jsonb; r public.drop_interest_requests; i public.order_invitations;
  o public.orders; pay public.payments; q public.manual_shipping_quotes; a public.operational_email_attempts; attempt_id uuid; qid uuid; now_at timestamptz := now();
begin
  if not exists (select 1 from public.admin_roles where user_id=p_actor and revoked_at is null) then raise exception using message='forbidden', errcode='P0001'; end if;
  if p_action='quote.approve' and not exists (select 1 from public.admin_roles where user_id=p_actor and role='manager' and revoked_at is null) then raise exception using message='insufficient_role', errcode='P0001'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_actor::text || ':' || p_action || ':' || p_idempotency_key, 0));
  select * into prior from public.admin_operation_idempotency where actor_user_id=p_actor and action=p_action and idempotency_key=p_idempotency_key for update;
  if found then
    if prior.request_hash <> p_request_hash then raise exception using message='idempotency_conflict', errcode='P0001'; end if;
    if prior.result is null then raise exception using message='operation_in_progress', errcode='P0001'; end if;
    return prior.result || jsonb_build_object('replay',true);
  end if;
  insert into public.admin_operation_idempotency(actor_user_id,action,idempotency_key,request_hash)
    values(p_actor,p_action,p_idempotency_key,p_request_hash);

  if p_action in ('invitation.send','invitation.resend') then
    if not ((p_context->>'tokenHash') ~ '^[a-f0-9]{64}$') or
       not ((p_context->>'expiresAt')::timestamptz > now_at and (p_context->>'expiresAt')::timestamptz <= now_at + interval '30 days') or
       nullif(btrim(p_context->>'dropId'),'') is null or nullif(btrim(p_context->>'dropTitle'),'') is null or
       (p_context->>'unitPrice')::numeric <= 0 or not ((p_context->>'currency') ~ '^[A-Z]{3}$') then
      raise exception using message='invalid_invitation_context', errcode='P0001';
    end if;
    select * into r from public.drop_interest_requests where id=(p_request->>'reservationId')::uuid for update;
    if not found then raise exception using message='not_found', errcode='P0001'; end if;
    if r.reservation_status in ('converted','cancelled') or r.status in ('converted','cancelled') then raise exception using message='invalid_transition', errcode='P0001'; end if;
    select * into i from public.order_invitations where interest_request_id=r.id order by created_at desc limit 1 for update;
    if p_action='invitation.send' and i.id is not null and i.status not in ('draft','expired') then raise exception using message='invalid_transition', errcode='P0001'; end if;
    if p_action='invitation.resend' and (i.id is null or i.status not in ('sent','opened')) then raise exception using message='invalid_transition', errcode='P0001'; end if;
    if i.id is null then
      insert into public.order_invitations(interest_request_id,drop_id,drop_slug,drop_title,email,email_normalized,first_name,last_name,quantity,currency,unit_price,subtotal_amount,status,token_hash,expires_at)
      values(r.id,p_context->>'dropId',r.drop_slug,p_context->>'dropTitle',r.email,coalesce(r.email_normalized,lower(r.email)),r.first_name,r.last_name,r.quantity,p_context->>'currency',
        (p_context->>'unitPrice')::numeric,(p_context->>'unitPrice')::numeric*r.quantity,'draft',encode(extensions.digest(extensions.gen_random_bytes(32),'sha256'),'hex'),(p_context->>'expiresAt')::timestamptz)
      returning * into i;
    end if;
    select * into a from public.operational_email_attempts where template='order_invitation' and entity_type='order_invitation'
      and entity_id=i.id::text and delivery_status='pending' for update;
    if a.id is not null and a.expires_at <= now_at then
      update public.operational_email_attempts set delivery_status='failed',completed_at=now_at,dispatch_lease_expires_at=null where id=a.id;
      insert into public.email_delivery_events(actor_user_id,attempt_id,entity_type,entity_id,template,template_version,delivery_status,correlation_id,details)
        values(p_actor,a.id,a.entity_type,a.entity_id,a.template,a.template_version,'failed',a.id,jsonb_build_object('truthful_outcome',true,'reason','token_expired_before_confirmation'));
      insert into public.admin_audit_events(actor_user_id,action,entity_type,entity_id,correlation_id,idempotency_key,details)
        values(p_actor,'order_invitation.delivery.failed',a.entity_type,a.entity_id,a.id,p_idempotency_key,jsonb_build_object('delivery_status','failed','reason','token_expired_before_confirmation'));
      insert into public.entity_events(actor_user_id,source,event_type,entity_type,entity_id,correlation_id,idempotency_key,payload)
        values(p_actor,'admin','order_invitation.delivery.failed',a.entity_type,a.entity_id,a.id,p_idempotency_key,jsonb_build_object('delivery_status','failed','reason','token_expired_before_confirmation'));
      update public.admin_operation_idempotency set result=(coalesce(result,'{}'::jsonb)-'emailAttemptId') ||
        jsonb_build_object('success',true,'emailAttemptId',a.id,'deliveryStatus','failed'),completed_at=now_at
        where result->>'emailAttemptId'=a.id::text;
      a.id:=null;
    end if;
    if a.id is not null then
      attempt_id:=a.id;
    else
      insert into public.operational_email_attempts(actor_user_id,action,idempotency_key,template,entity_type,entity_id,token_hash,expires_at)
        values(p_actor,p_action,p_idempotency_key,'order_invitation','order_invitation',i.id::text,p_context->>'tokenHash',(p_context->>'expiresAt')::timestamptz)
        returning id into attempt_id;
    end if;
    v_result:=jsonb_build_object('success',true,'entityId',i.id,'emailAttemptId',attempt_id,'deliveryStatus','pending');

  elsif p_action='quote.approve' then
    select * into i from public.order_invitations where id=(p_request->>'invitationId')::uuid for update;
    if not found then raise exception using message='not_found', errcode='P0001'; end if;
    if i.status not in ('draft','sent','opened','order_started') or i.expires_at is null or i.expires_at <= now_at then raise exception using message='invalid_transition', errcode='P0001'; end if;
    if i.updated_at <> (p_request->>'expectedInvitationUpdatedAt')::timestamptz then raise exception using message='stale_transition', errcode='P0001'; end if;
    select * into q from public.manual_shipping_quotes where invitation_id=i.id and status='approved' for update;
    if q.id is not null and exists(select 1 from public.orders where manual_shipping_quote_id=q.id and status in ('awaiting_payment','payment_open','paid')) then
      raise exception using message='quote_in_use', errcode='P0001';
    end if;
    update public.manual_shipping_quotes set status=case when expires_at <= now_at then 'expired' else 'cancelled' end,updated_at=now_at where invitation_id=i.id and status='approved';
    insert into public.manual_shipping_quotes(invitation_id,country_code,shipping_amount,currency,expires_at,approved_by)
      values(i.id,upper(p_request->>'countryCode'),(p_request->>'shippingAmount')::numeric,p_request->>'currency',(p_request->>'expiresAt')::timestamptz,p_actor)
      returning id into qid;
    if (p_request->>'expiresAt')::timestamptz <= now_at then raise exception using message='invalid_expiry', errcode='P0001'; end if;
    update public.order_invitations set updated_at=now_at where id=i.id;
    v_result:=jsonb_build_object('success',true,'quoteId',qid,'deliveryStatus',null);
    insert into public.admin_audit_events(actor_user_id,action,entity_type,entity_id,idempotency_key,details)
      values(p_actor,'quote.approved','order_invitation',i.id::text,p_idempotency_key,jsonb_build_object('quote_id',qid,'country_code',upper(p_request->>'countryCode'),'expires_at',p_request->>'expiresAt'));
    insert into public.entity_events(actor_user_id,source,event_type,entity_type,entity_id,idempotency_key,payload)
      values(p_actor,'admin','quote.approved','order_invitation',i.id::text,p_idempotency_key,jsonb_build_object('quote_id',qid,'country_code',upper(p_request->>'countryCode')));

  elsif p_action='fulfilment.transition' then
    select * into o from public.orders where id=(p_request->>'orderId')::uuid for update;
    if not found then raise exception using message='not_found', errcode='P0001'; end if;
    select * into pay from public.payments where order_id=o.id and provider='mollie' and status='paid'
      and provider_payment_id is not null and webhook_received_at is not null and paid_at is not null
      and amount=o.total_amount and currency=o.currency order by paid_at desc limit 1 for update;
    if o.status <> 'paid' or pay.id is null then raise exception using message='payment_not_confirmed', errcode='P0001'; end if;
    if o.fulfilment_status <> p_request->>'expectedStatus' or o.fulfilment_version <> (p_request->>'expectedVersion')::bigint then raise exception using message='stale_transition', errcode='P0001'; end if;
    if not ((o.fulfilment_status='unfulfilled' and p_request->>'targetStatus'='ready_to_pack') or
            (o.fulfilment_status='ready_to_pack' and p_request->>'targetStatus'='packed') or
            (o.fulfilment_status='packed' and p_request->>'targetStatus'='shipped')) then raise exception using message='invalid_transition', errcode='P0001'; end if;
    if p_request->>'targetStatus'='shipped' and (nullif(btrim(p_request->>'carrier'),'') is null or nullif(btrim(p_request->>'trackingNumber'),'') is null) then
      raise exception using message='tracking_required', errcode='P0001';
    end if;
    update public.orders set fulfilment_status=p_request->>'targetStatus',fulfilment_version=fulfilment_version+1,
      carrier=case when p_request->>'targetStatus'='shipped' then btrim(p_request->>'carrier') else carrier end,
      tracking_number=case when p_request->>'targetStatus'='shipped' then btrim(p_request->>'trackingNumber') else tracking_number end,
      shipped_at=case when p_request->>'targetStatus'='shipped' then now_at else shipped_at end,updated_at=now_at where id=o.id;
    insert into public.admin_audit_events(actor_user_id,action,entity_type,entity_id,idempotency_key,details)
      values(p_actor,'fulfilment.'||(p_request->>'targetStatus'),'order',o.id::text,p_idempotency_key,jsonb_build_object('from',o.fulfilment_status,'to',p_request->>'targetStatus','carrier',p_request->>'carrier','tracking_present',(p_request ? 'trackingNumber')));
    insert into public.entity_events(actor_user_id,source,event_type,entity_type,entity_id,idempotency_key,payload)
      values(p_actor,'admin','fulfilment.'||(p_request->>'targetStatus'),'order',o.id::text,p_idempotency_key,jsonb_build_object('from',o.fulfilment_status,'to',p_request->>'targetStatus','version',o.fulfilment_version+1));
    if p_request->>'targetStatus'='shipped' then
      insert into public.operational_email_attempts(actor_user_id,action,idempotency_key,template,entity_type,entity_id)
        values(p_actor,p_action,p_idempotency_key,'shipping_confirmation','order',o.id::text) returning id into attempt_id;
      update public.orders set shipping_email_status='pending' where id=o.id;
      v_result:=jsonb_build_object('success',true,'entityId',o.id,'fulfilmentStatus','shipped','fulfilmentVersion',o.fulfilment_version+1,'emailAttemptId',attempt_id,'deliveryStatus','pending');
    else
      v_result:=jsonb_build_object('success',true,'entityId',o.id,'fulfilmentStatus',p_request->>'targetStatus','fulfilmentVersion',o.fulfilment_version+1,'deliveryStatus',null);
    end if;
  elsif p_action='shipping.retry' then
    select * into o from public.orders where id=(p_request->>'orderId')::uuid for update;
    if not found then raise exception using message='not_found', errcode='P0001'; end if;
    select * into pay from public.payments where order_id=o.id and provider='mollie' and status='paid'
      and provider_payment_id is not null and webhook_received_at is not null and paid_at is not null
      and amount=o.total_amount and currency=o.currency order by paid_at desc limit 1 for update;
    if o.status <> 'paid' or pay.id is null then raise exception using message='payment_not_confirmed', errcode='P0001'; end if;
    if o.fulfilment_status <> 'shipped' or nullif(btrim(o.carrier),'') is null or nullif(btrim(o.tracking_number),'') is null then raise exception using message='invalid_transition', errcode='P0001'; end if;
    select * into a from public.operational_email_attempts where template='shipping_confirmation' and entity_type='order' and entity_id=o.id::text order by created_at desc limit 1 for update;
    if a.delivery_status='sent' then raise exception using message='invalid_transition', errcode='P0001'; end if;
    if a.delivery_status='pending' then attempt_id:=a.id;
    else
      insert into public.operational_email_attempts(actor_user_id,action,idempotency_key,template,entity_type,entity_id)
        values(p_actor,p_action,p_idempotency_key,'shipping_confirmation','order',o.id::text) returning id into attempt_id;
    end if;
    update public.orders set shipping_email_status='pending' where id=o.id;
    v_result:=jsonb_build_object('success',true,'entityId',o.id,'fulfilmentStatus','shipped','fulfilmentVersion',o.fulfilment_version,'emailAttemptId',attempt_id,'deliveryStatus','pending');
    insert into public.admin_audit_events(actor_user_id,action,entity_type,entity_id,idempotency_key,details)
      values(p_actor,'shipping_confirmation.retry.prepared','order',o.id::text,p_idempotency_key,jsonb_build_object('attempt_id',attempt_id));
    insert into public.entity_events(actor_user_id,source,event_type,entity_type,entity_id,idempotency_key,payload)
      values(p_actor,'admin','shipping_confirmation.retry.prepared','order',o.id::text,p_idempotency_key,jsonb_build_object('attempt_id',attempt_id));
  else
    raise exception using message='invalid_action', errcode='P0001';
  end if;
  update public.admin_operation_idempotency set result=v_result,completed_at=case when v_result->>'deliveryStatus'='pending' then null else now() end
    where actor_user_id=p_actor and action=p_action and idempotency_key=p_idempotency_key;
  return v_result || jsonb_build_object('replay',false);
end $function$
;
CREATE OR REPLACE FUNCTION public.admin_a3_claim_delivery(p_actor uuid, p_attempt_id uuid, p_claim_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare a public.operational_email_attempts; now_at timestamptz:=now();
begin
  if not exists(select 1 from public.admin_roles where user_id=p_actor and revoked_at is null) then raise exception using message='forbidden', errcode='P0001'; end if;
  select * into a from public.operational_email_attempts where id=p_attempt_id for update;
  if not found then raise exception using message='delivery_attempt_mismatch', errcode='P0001'; end if;
  if a.delivery_status <> 'pending' then return jsonb_build_object('claimed',false,'deliveryStatus',a.delivery_status); end if;
  if a.dispatch_claim_id is not null and a.dispatch_claim_id <> p_claim_id and a.dispatch_lease_expires_at > now_at then
    raise exception using message='operation_in_progress', errcode='P0001';
  end if;
  update public.operational_email_attempts set dispatch_claim_id=p_claim_id,dispatch_started_at=coalesce(dispatch_started_at,now_at),
    dispatch_lease_expires_at=now_at+interval '5 minutes' where id=a.id;
  return jsonb_build_object('claimed',true,'leaseExpiresAt',now_at+interval '5 minutes');
end $function$
;
CREATE OR REPLACE FUNCTION public.admin_a3_delivery_payload(p_actor uuid, p_attempt_id uuid, p_claim_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare a public.operational_email_attempts; i public.order_invitations; o public.orders;
begin
  if not exists(select 1 from public.admin_roles where user_id=p_actor and revoked_at is null) then raise exception using message='forbidden', errcode='P0001'; end if;
  select * into a from public.operational_email_attempts where id=p_attempt_id and dispatch_claim_id=p_claim_id
    and dispatch_lease_expires_at > now() and delivery_status='pending';
  if not found then raise exception using message='delivery_attempt_mismatch', errcode='P0001'; end if;
  if a.template='order_invitation' then
    select * into i from public.order_invitations where id=a.entity_id::uuid;
    return jsonb_build_object('template',a.template,'recipientEmail',i.email,'firstName',i.first_name,'dropTitle',i.drop_title,'expiresAt',a.expires_at,
      'reservationId',i.interest_request_id,'tokenActorUserId',a.actor_user_id,'tokenAction',a.action,'tokenIdempotencyKey',a.idempotency_key,'tokenHash',a.token_hash);
  end if;
  select * into o from public.orders where id=a.entity_id::uuid;
  return jsonb_build_object('template',a.template,'recipientEmail',o.email,'firstName',o.first_name,'dropTitle',o.drop_title,'carrier',o.carrier,'trackingNumber',o.tracking_number);
end $function$
;
CREATE OR REPLACE FUNCTION public.admin_a3_complete_delivery(p_actor uuid, p_action text, p_idempotency_key text, p_request_hash text, p_attempt_id uuid, p_claim_id uuid, p_delivery_status text, p_provider_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare prior public.admin_operation_idempotency; a public.operational_email_attempts; i public.order_invitations; r public.drop_interest_requests;
  v_result jsonb; old_i_status text; old_r_status text; old_legacy_status text; now_at timestamptz:=now();
begin
  if not exists(select 1 from public.admin_roles where user_id=p_actor and revoked_at is null) then raise exception using message='forbidden', errcode='P0001'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_actor::text || ':' || p_action || ':' || p_idempotency_key,0));
  select * into prior from public.admin_operation_idempotency where actor_user_id=p_actor and action=p_action and idempotency_key=p_idempotency_key for update;
  if not found or prior.request_hash <> p_request_hash then raise exception using message='idempotency_conflict', errcode='P0001'; end if;
  if prior.result->>'emailAttemptId' is distinct from p_attempt_id::text then raise exception using message='delivery_attempt_mismatch', errcode='P0001'; end if;
  select * into a from public.operational_email_attempts where id=p_attempt_id for update;
  if not found or a.dispatch_claim_id is distinct from p_claim_id then raise exception using message='delivery_attempt_mismatch', errcode='P0001'; end if;
  if a.delivery_status <> 'pending' then return prior.result || jsonb_build_object('replay',true); end if;
  if p_delivery_status not in ('suppressed','sent','failed') or (p_delivery_status='sent' and nullif(btrim(p_provider_id),'') is null) then
    raise exception using message='delivery_attempt_mismatch', errcode='P0001';
  end if;
  if a.template='order_invitation' and p_delivery_status='sent' then
    select * into i from public.order_invitations where id=a.entity_id::uuid for update;
    select * into r from public.drop_interest_requests where id=i.interest_request_id for update;
    old_i_status:=i.status; old_r_status:=r.reservation_status; old_legacy_status:=r.status;
    update public.order_invitations set token_hash=a.token_hash,expires_at=a.expires_at,
      status=case when status in ('draft','expired','sent','opened') then 'sent' else status end,
      sent_at=now_at,updated_at=now_at where id=i.id returning * into i;
    update public.drop_interest_requests set
      reservation_status=case when reservation_status in ('new','contacted','order_invited') then 'order_invited' else reservation_status end,
      status=case when status in ('new','contacted','payment_link_sent') then 'payment_link_sent' else status end
      where id=r.id returning * into r;
    insert into public.admin_audit_events(actor_user_id,action,entity_type,entity_id,correlation_id,idempotency_key,details)
      values(p_actor,'invitation.lifecycle.delivery_confirmed','order_invitation',i.id::text,a.id,p_idempotency_key,
        jsonb_build_object('from',old_i_status,'to',i.status,'token_rotated',true,'expires_at',a.expires_at));
    insert into public.entity_events(actor_user_id,source,event_type,entity_type,entity_id,correlation_id,idempotency_key,payload)
      values(p_actor,'admin','invitation.lifecycle.delivery_confirmed','order_invitation',i.id::text,a.id,p_idempotency_key,jsonb_build_object('from',old_i_status,'to',i.status));
    insert into public.admin_audit_events(actor_user_id,action,entity_type,entity_id,correlation_id,idempotency_key,details)
      values(p_actor,'reservation.lifecycle.invited','reservation',r.id::text,a.id,p_idempotency_key,
        jsonb_build_object('reservation_status_from',old_r_status,'reservation_status_to',r.reservation_status,'legacy_status_from',old_legacy_status,'legacy_status_to',r.status));
    insert into public.entity_events(actor_user_id,source,event_type,entity_type,entity_id,correlation_id,idempotency_key,payload)
      values(p_actor,'admin','reservation.lifecycle.invited','reservation',r.id::text,a.id,p_idempotency_key,
        jsonb_build_object('reservation_status_from',old_r_status,'reservation_status_to',r.reservation_status,'legacy_status_from',old_legacy_status,'legacy_status_to',r.status));
  end if;
  update public.operational_email_attempts set delivery_status=p_delivery_status,provider_id=case when p_delivery_status='sent' then p_provider_id else null end,
    completed_at=now_at,dispatch_lease_expires_at=null where id=a.id;
  if a.template='shipping_confirmation' then
    update public.orders set shipping_email_status=p_delivery_status,updated_at=now_at where id=a.entity_id::uuid;
  end if;
  insert into public.email_delivery_events(actor_user_id,attempt_id,entity_type,entity_id,template,template_version,delivery_status,provider_id,correlation_id,details)
    values(p_actor,a.id,a.entity_type,a.entity_id,a.template,a.template_version,p_delivery_status,case when p_delivery_status='sent' then p_provider_id else null end,a.id,jsonb_build_object('truthful_outcome',true));
  insert into public.admin_audit_events(actor_user_id,action,entity_type,entity_id,correlation_id,idempotency_key,details)
    values(p_actor,a.template||'.delivery.'||p_delivery_status,a.entity_type,a.entity_id,a.id,p_idempotency_key,jsonb_build_object('delivery_status',p_delivery_status,'provider_confirmed',p_delivery_status='sent'));
  insert into public.entity_events(actor_user_id,source,event_type,entity_type,entity_id,correlation_id,idempotency_key,payload)
    values(p_actor,'admin',a.template||'.delivery.'||p_delivery_status,a.entity_type,a.entity_id,a.id,p_idempotency_key,jsonb_build_object('delivery_status',p_delivery_status));
  v_result:=coalesce(prior.result,'{}'::jsonb)-'emailAttemptId' || jsonb_build_object('success',true,'emailAttemptId',a.id,'deliveryStatus',p_delivery_status);
  update public.admin_operation_idempotency set
    result=(coalesce(result,'{}'::jsonb)-'emailAttemptId') || jsonb_build_object('success',true,'emailAttemptId',a.id,'deliveryStatus',p_delivery_status),completed_at=now_at
    where result->>'emailAttemptId'=a.id::text;
  select result into v_result from public.admin_operation_idempotency where actor_user_id=p_actor and action=p_action and idempotency_key=p_idempotency_key;
  return v_result || jsonb_build_object('replay',false);
end $function$
;
CREATE OR REPLACE FUNCTION public.admin_a31_set_email_lineage()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if new.interest_request_id is not null then return new; end if;
  if new.entity_type = 'order_invitation' then
    select i.interest_request_id into new.interest_request_id
    from public.order_invitations i where i.id::text = new.entity_id;
  elsif new.entity_type = 'order' then
    select o.interest_request_id into new.interest_request_id
    from public.orders o where o.id::text = new.entity_id;
  end if;
  return new;
end $function$
;
CREATE OR REPLACE FUNCTION public.admin_a31_order_address_complete(p_order orders)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select
    nullif(btrim(p_order.shipping_name), '') is not null and
    nullif(btrim(p_order.email), '') is not null and
    p_order.email ~* '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' and
    nullif(btrim(p_order.address_line1), '') is not null and
    nullif(btrim(p_order.postal_code), '') is not null and
    nullif(btrim(p_order.city), '') is not null and
    p_order.shipping_country_code ~ '^[A-Z]{2}$' and
    (p_order.shipping_country_code not in ('US', 'CA', 'AU') or nullif(btrim(p_order.region), '') is not null)
$function$
;
CREATE OR REPLACE FUNCTION public.admin_a31_enforce_shipping_address()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if new.fulfilment_status = 'shipped' and not public.admin_a31_order_address_complete(new) then
    raise exception using message = 'shipping_address_incomplete', errcode = 'P0001';
  end if;
  return new;
end $function$
;
CREATE OR REPLACE FUNCTION public.admin_a31_protect_paid_address()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if (new.email, new.first_name, new.last_name, new.shipping_name, new.shipping_company,
      new.address_line1, new.address_line2, new.postal_code, new.city, new.region,
      new.shipping_country, new.shipping_country_code)
     is distinct from
     (old.email, old.first_name, old.last_name, old.shipping_name, old.shipping_company,
      old.address_line1, old.address_line2, old.postal_code, old.city, old.region,
      old.shipping_country, old.shipping_country_code)
     and exists (
       select 1 from public.payments p
       where p.order_id = old.id
         and p.provider = 'mollie'
         and p.status = 'paid'
         and p.provider_payment_id is not null
         and p.webhook_received_at is not null
         and p.paid_at is not null
         and p.amount = old.total_amount
         and p.currency = old.currency
     ) then
    raise exception using message = 'paid_address_immutable', errcode = 'P0001';
  end if;
  return new;
end $function$
;
CREATE OR REPLACE FUNCTION public.admin_a31_assert_shipping_ready(p_actor uuid, p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare o public.orders;
begin
  if not exists(select 1 from public.admin_roles where user_id = p_actor and revoked_at is null) then
    raise exception using message = 'forbidden', errcode = 'P0001';
  end if;
  select * into o from public.orders where id = p_order_id;
  if not found then raise exception using message = 'not_found', errcode = 'P0001'; end if;
  if not public.admin_a31_order_address_complete(o) then
    raise exception using message = 'shipping_address_incomplete', errcode = 'P0001';
  end if;
  return jsonb_build_object('ready', true);
end $function$
;
CREATE OR REPLACE FUNCTION public.admin_a31_preview_origin_change(p_actor uuid, p_reservation_id uuid, p_new_origin record_origin, p_expected_version bigint, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare r public.drop_interest_requests; invitation_count integer; order_count integer;
  payment_count integer; email_count integer;
begin
  if not exists(select 1 from public.admin_roles where user_id = p_actor and role = 'manager' and revoked_at is null) then
    raise exception using message = 'insufficient_role', errcode = 'P0001';
  end if;
  if nullif(btrim(p_reason), '') is null or length(btrim(p_reason)) > 500 then
    raise exception using message = 'origin_reason_required', errcode = 'P0001';
  end if;
  if p_reason ~* '@|https?://' or p_reason ~ '[[:cntrl:]]' then
    raise exception using message = 'origin_reason_required', errcode = 'P0001';
  end if;
  select * into r from public.drop_interest_requests where id = p_reservation_id;
  if not found then raise exception using message = 'not_found', errcode = 'P0001'; end if;
  if r.record_origin_version <> p_expected_version then raise exception using message = 'stale_transition', errcode = 'P0001'; end if;
  select count(*) into invitation_count from public.order_invitations where interest_request_id = r.id;
  select count(*) into order_count from public.orders where interest_request_id = r.id;
  select count(*) into payment_count from public.payments p join public.orders o on o.id = p.order_id where o.interest_request_id = r.id;
  select count(*) into email_count from public.operational_email_attempts where interest_request_id = r.id;
  return jsonb_build_object('success', true, 'preview', jsonb_build_object(
    'reservationId', r.id, 'previousOrigin', r.record_origin, 'newOrigin', p_new_origin,
    'previousNeedsReview', r.record_origin_needs_review, 'originVersion', r.record_origin_version,
    'reason', btrim(p_reason), 'affectedRecords', jsonb_build_object(
      'reservations', 1, 'invitations', invitation_count, 'orders', order_count,
      'payments', payment_count, 'emails', email_count), 'actionAllowed', true));
end $function$
;
CREATE OR REPLACE FUNCTION public.admin_a31_change_origin(p_actor uuid, p_idempotency_key text, p_request_hash text, p_reservation_id uuid, p_new_origin record_origin, p_expected_version bigint, p_reason text, p_confirmation text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare prior public.admin_operation_idempotency; r public.drop_interest_requests; v_result jsonb;
  invitation_count integer; order_count integer; payment_count integer; email_count integer;
begin
  if not exists(select 1 from public.admin_roles where user_id = p_actor and role = 'manager' and revoked_at is null) then
    raise exception using message = 'insufficient_role', errcode = 'P0001';
  end if;
  if p_confirmation <> 'CONFIRM' then raise exception using message = 'confirmation_required', errcode = 'P0001'; end if;
  if nullif(btrim(p_reason), '') is null or length(btrim(p_reason)) > 500 then
    raise exception using message = 'origin_reason_required', errcode = 'P0001';
  end if;
  if p_reason ~* '@|https?://' or p_reason ~ '[[:cntrl:]]' then
    raise exception using message = 'origin_reason_required', errcode = 'P0001';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_actor::text || ':origin.change:' || p_idempotency_key, 0));
  select * into prior from public.admin_operation_idempotency
    where actor_user_id = p_actor and action = 'origin.change' and idempotency_key = p_idempotency_key for update;
  if found then
    if prior.request_hash <> p_request_hash then raise exception using message = 'idempotency_conflict', errcode = 'P0001'; end if;
    if prior.result is null then raise exception using message = 'operation_in_progress', errcode = 'P0001'; end if;
    return prior.result || jsonb_build_object('replay', true);
  end if;
  insert into public.admin_operation_idempotency(actor_user_id, action, idempotency_key, request_hash)
    values(p_actor, 'origin.change', p_idempotency_key, p_request_hash);
  select * into r from public.drop_interest_requests where id = p_reservation_id for update;
  if not found then raise exception using message = 'not_found', errcode = 'P0001'; end if;
  if r.record_origin_version <> p_expected_version then raise exception using message = 'stale_transition', errcode = 'P0001'; end if;
  select count(*) into invitation_count from public.order_invitations where interest_request_id = r.id;
  select count(*) into order_count from public.orders where interest_request_id = r.id;
  select count(*) into payment_count from public.payments p join public.orders o on o.id = p.order_id where o.interest_request_id = r.id;
  select count(*) into email_count from public.operational_email_attempts where interest_request_id = r.id;
  update public.drop_interest_requests set record_origin = p_new_origin,
    record_origin_needs_review = false, record_origin_version = record_origin_version + 1
    where id = r.id;
  insert into public.admin_audit_events(actor_user_id, action, entity_type, entity_id, idempotency_key, details)
    values(p_actor, 'record_origin.changed', 'reservation', r.id::text, p_idempotency_key,
      jsonb_build_object('previous_origin', r.record_origin, 'new_origin', p_new_origin,
        'previous_needs_review', r.record_origin_needs_review, 'new_needs_review', false,
        'reason', btrim(p_reason), 'previous_version', r.record_origin_version,
        'new_version', r.record_origin_version + 1,
        'affected_records', jsonb_build_object('reservations', 1, 'invitations', invitation_count,
          'orders', order_count, 'payments', payment_count, 'emails', email_count)));
  insert into public.entity_events(actor_user_id, source, event_type, entity_type, entity_id, idempotency_key, payload)
    values(p_actor, 'admin', 'record_origin.changed', 'reservation', r.id::text, p_idempotency_key,
      jsonb_build_object('previous_origin', r.record_origin, 'new_origin', p_new_origin,
        'previous_needs_review', r.record_origin_needs_review, 'new_needs_review', false,
        'previous_version', r.record_origin_version, 'new_version', r.record_origin_version + 1));
  v_result := jsonb_build_object('success', true, 'entityId', r.id, 'recordOrigin', p_new_origin,
    'recordOriginNeedsReview', false, 'recordOriginVersion', r.record_origin_version + 1,
    'affectedRecords', jsonb_build_object('reservations', 1, 'invitations', invitation_count,
      'orders', order_count, 'payments', payment_count, 'emails', email_count));
  update public.admin_operation_idempotency set result = v_result, completed_at = now()
    where actor_user_id = p_actor and action = 'origin.change' and idempotency_key = p_idempotency_key;
  return v_result || jsonb_build_object('replay', false);
end $function$
;
CREATE OR REPLACE FUNCTION public.admin_a32_preserve_previous_invitation_token()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if old.token_hash is not null and new.token_hash is distinct from old.token_hash then
    new.previous_token_hash := old.token_hash;
    new.previous_token_expires_at := old.expires_at;
  end if;
  return new;
end $function$
;
CREATE OR REPLACE FUNCTION public.admin_a32_preview_action(p_actor uuid, p_action text, p_request jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare result jsonb; r public.drop_interest_requests; invitation_count bigint; latest public.operational_email_attempts;
begin
  if p_action like 'invitation.%' and not exists (
    select 1 from public.admin_roles where user_id = p_actor and role = 'manager' and revoked_at is null
  ) then raise exception using message = 'insufficient_role', errcode = 'P0001'; end if;
  result := public.admin_a3_preview_action(p_actor, p_action, p_request);
  if p_action like 'invitation.%' then
    select * into r from public.drop_interest_requests where id = (p_request->>'reservationId')::uuid;
    select count(*) into invitation_count from public.order_invitations where interest_request_id = r.id;
    if invitation_count > 1 then raise exception using message = 'ambiguous_invitations', errcode = 'P0001'; end if;
    if invitation_count = 1 and exists (
      select 1 from public.order_invitations i where i.interest_request_id = r.id
      and coalesce(i.email_normalized, lower(i.email)) <> coalesce(r.email_normalized, lower(r.email))
    ) then raise exception using message = 'recipient_mismatch', errcode = 'P0001'; end if;
    select a.* into latest from public.operational_email_attempts a
      join public.order_invitations i on i.id::text = a.entity_id
      where i.interest_request_id = r.id and a.template = 'order_invitation'
      order by a.created_at desc limit 1;
    result := jsonb_set(result, '{preview}', (result->'preview') || jsonb_build_object(
      'dropTitle', r.drop_title,
      'maskedRecipient', case when position('@' in r.email) > 1 then left(r.email, 1) || '***@' || split_part(r.email, '@', 2) else '***' end,
      'previousDeliveryStatus', latest.delivery_status,
      'previousDeliveryCompletedAt', latest.completed_at
    ));
  end if;
  return result;
end $function$
;
CREATE OR REPLACE FUNCTION public.admin_a32_apply_action(p_actor uuid, p_action text, p_idempotency_key text, p_request_hash text, p_request jsonb, p_context jsonb, p_confirmation_hash text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare r public.drop_interest_requests; invitation_count bigint;
begin
  if p_confirmation_hash is distinct from p_request_hash or p_request_hash !~ '^[a-f0-9]{64}$' then
    raise exception using message = 'confirmation_required', errcode = 'P0001';
  end if;
  if p_action like 'invitation.%' then
    if not exists(select 1 from public.admin_roles where user_id=p_actor and role='manager' and revoked_at is null) then
      raise exception using message='insufficient_role', errcode='P0001';
    end if;
    select * into r from public.drop_interest_requests where id=(p_request->>'reservationId')::uuid for update;
    if not found then raise exception using message='not_found', errcode='P0001'; end if;
    select count(*) into invitation_count from public.order_invitations where interest_request_id=r.id;
    if invitation_count > 1 then raise exception using message='ambiguous_invitations', errcode='P0001'; end if;
    if invitation_count = 1 and exists(select 1 from public.order_invitations i where i.interest_request_id=r.id
      and coalesce(i.email_normalized,lower(i.email)) <> coalesce(r.email_normalized,lower(r.email))) then
      raise exception using message='recipient_mismatch', errcode='P0001';
    end if;
  end if;
  return public.admin_a3_apply_action(p_actor,p_action,p_idempotency_key,p_request_hash,p_request,p_context);
end $function$
;
CREATE OR REPLACE FUNCTION public.admin_a32_change_origin(p_actor uuid, p_idempotency_key text, p_request_hash text, p_reservation_id uuid, p_new_origin record_origin, p_expected_version bigint, p_reason text, p_confirmation_hash text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if p_confirmation_hash is distinct from p_request_hash or p_request_hash !~ '^[a-f0-9]{64}$' then
    raise exception using message='confirmation_required', errcode='P0001';
  end if;
  return public.admin_a31_change_origin(p_actor,p_idempotency_key,p_request_hash,p_reservation_id,p_new_origin,p_expected_version,p_reason,'CONFIRM');
end $function$
;
CREATE OR REPLACE FUNCTION public.admin_a32_claim_delivery(p_actor uuid, p_attempt_id uuid, p_claim_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare a public.operational_email_attempts;
begin
  select * into a from public.operational_email_attempts where id=p_attempt_id;
  if not found then raise exception using message='not_found', errcode='P0001'; end if;
  if a.template='order_invitation' and not exists(select 1 from public.admin_roles where user_id=p_actor and role='manager' and revoked_at is null) then
    raise exception using message='insufficient_role', errcode='P0001';
  end if;
  if a.delivery_status='pending' and a.dispatch_started_at is not null and a.dispatch_started_at <= now() - interval '23 hours' then
    return jsonb_build_object('claimed',false,'deliveryStatus','pending','reconciliationRequired',true);
  end if;
  return public.admin_a3_claim_delivery(p_actor,p_attempt_id,p_claim_id);
end $function$
;
CREATE OR REPLACE FUNCTION public.admin_a32_delivery_payload(p_actor uuid, p_attempt_id uuid, p_claim_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare a public.operational_email_attempts;
begin
  select * into a from public.operational_email_attempts where id=p_attempt_id;
  if a.template='order_invitation' and not exists(select 1 from public.admin_roles where user_id=p_actor and role='manager' and revoked_at is null) then
    raise exception using message='insufficient_role', errcode='P0001';
  end if;
  return public.admin_a3_delivery_payload(p_actor,p_attempt_id,p_claim_id);
end $function$
;
CREATE OR REPLACE FUNCTION public.admin_a32_complete_delivery(p_actor uuid, p_action text, p_idempotency_key text, p_request_hash text, p_attempt_id uuid, p_claim_id uuid, p_delivery_status text, p_provider_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare a public.operational_email_attempts;
begin
  select * into a from public.operational_email_attempts where id=p_attempt_id;
  if a.template='order_invitation' and not exists(select 1 from public.admin_roles where user_id=p_actor and role='manager' and revoked_at is null) then
    raise exception using message='insufficient_role', errcode='P0001';
  end if;
  if p_delivery_status='sent' and (p_provider_id is null or length(p_provider_id) > 200 or p_provider_id !~ '^[A-Za-z0-9_-]+$') then
    raise exception using message='invalid_provider_id', errcode='P0001';
  end if;
  return public.admin_a3_complete_delivery(p_actor,p_action,p_idempotency_key,p_request_hash,p_attempt_id,p_claim_id,p_delivery_status,p_provider_id);
end $function$
;
create view public.admin_invitation_list_v1 with (security_invoker = true) as
 SELECT i.id,
    i.interest_request_id,
    i.drop_slug,
    i.drop_title,
    i.quantity,
    i.currency,
    i.unit_price,
    i.subtotal_amount,
    i.status,
    i.expires_at,
    i.sent_at,
    i.created_at,
    i.updated_at,
    COALESCE(r.record_origin, 'customer'::record_origin) AS record_origin,
    COALESCE(r.record_origin_needs_review, true) AS record_origin_needs_review,
    latest.delivery_status,
    latest.completed_at AS delivery_completed_at
   FROM order_invitations i
     LEFT JOIN drop_interest_requests r ON r.id = i.interest_request_id
     LEFT JOIN LATERAL ( SELECT a.delivery_status,
            a.completed_at
           FROM operational_email_attempts a
          WHERE a.template = 'order_invitation'::text AND a.entity_type = 'order_invitation'::text AND a.entity_id = i.id::text
          ORDER BY a.created_at DESC
         LIMIT 1) latest ON true;;
create view public.admin_order_list_v1 with (security_invoker = true) as
 SELECT o.id,
    o.invitation_id,
    o.interest_request_id,
    o.drop_slug,
    o.drop_title,
    concat_ws(' '::text, o.first_name, o.last_name) AS customer_name,
    o.status,
    latest_payment.status AS payment_status,
    o.fulfilment_status,
    o.fulfilment_version,
    o.carrier,
    o.tracking_number,
    o.shipped_at,
    o.shipping_email_status,
    o.quantity,
    o.currency,
    o.subtotal_amount,
    o.shipping_amount,
    o.total_amount,
    o.shipping_country_code,
    o.created_at,
    o.updated_at,
    COALESCE(r.record_origin, 'customer'::record_origin) AS record_origin,
    COALESCE(r.record_origin_needs_review, true) AS record_origin_needs_review
   FROM orders o
     LEFT JOIN drop_interest_requests r ON r.id = o.interest_request_id
     LEFT JOIN LATERAL ( SELECT p.status
           FROM payments p
          WHERE p.order_id = o.id
          ORDER BY p.created_at DESC
         LIMIT 1) latest_payment ON true;;
create view public.admin_payment_list_v1 with (security_invoker = true) as
 SELECT p.id,
    p.order_id,
    p.provider,
    p.status,
    p.amount,
    p.currency,
    p.webhook_received_at,
    p.paid_at,
    p.created_at,
    p.updated_at,
    COALESCE(r.record_origin, 'customer'::record_origin) AS record_origin,
    COALESCE(r.record_origin_needs_review, true) AS record_origin_needs_review
   FROM payments p
     JOIN orders o ON o.id = p.order_id
     LEFT JOIN drop_interest_requests r ON r.id = o.interest_request_id;;
create view public.admin_reservation_list_v1 with (security_invoker = true) as
 SELECT id,
    created_at,
    drop_slug,
    drop_title,
    COALESCE(NULLIF(btrim(full_name), ''::text), concat_ws(' '::text, first_name, last_name)) AS customer_name,
        CASE
            WHEN POSITION(('@'::text) IN (email)) > 1 THEN ("left"(email, 1) || '***@'::text) || split_part(email, '@'::text, 2)
            ELSE '***'::text
        END AS masked_email,
    preferred_format,
    quantity,
    country_code,
    status,
    reservation_status,
    record_origin,
    record_origin_needs_review,
    record_origin_version
   FROM drop_interest_requests r;;
CREATE TRIGGER admin_audit_events_no_update BEFORE DELETE OR UPDATE ON admin_audit_events FOR EACH ROW EXECUTE FUNCTION prevent_protected_history_mutation();
CREATE TRIGGER email_delivery_events_no_update BEFORE DELETE OR UPDATE ON email_delivery_events FOR EACH ROW EXECUTE FUNCTION prevent_protected_history_mutation();
CREATE TRIGGER entity_events_no_update BEFORE DELETE OR UPDATE ON entity_events FOR EACH ROW EXECUTE FUNCTION prevent_protected_history_mutation();
CREATE TRIGGER operational_email_attempts_set_lineage BEFORE INSERT ON operational_email_attempts FOR EACH ROW EXECUTE FUNCTION admin_a31_set_email_lineage();
CREATE TRIGGER order_invitations_preserve_previous_token BEFORE UPDATE OF token_hash ON order_invitations FOR EACH ROW EXECUTE FUNCTION admin_a32_preserve_previous_invitation_token();
CREATE TRIGGER orders_protect_paid_address BEFORE UPDATE OF email, first_name, last_name, shipping_name, shipping_company, address_line1, address_line2, postal_code, city, region, shipping_country, shipping_country_code ON orders FOR EACH ROW EXECUTE FUNCTION admin_a31_protect_paid_address();
CREATE TRIGGER orders_require_complete_shipping_address BEFORE INSERT OR UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION admin_a31_enforce_shipping_address();
CREATE TRIGGER orders_validate_manual_quote BEFORE INSERT OR UPDATE OF invitation_id, manual_shipping_quote_id, shipping_country_code, currency, shipping_amount ON orders FOR EACH ROW EXECUTE FUNCTION validate_order_manual_quote();
CREATE TRIGGER product_registry_code_immutable BEFORE UPDATE ON product_registry FOR EACH ROW EXECUTE FUNCTION prevent_product_code_change();
alter table public.admin_audit_events enable row level security;
alter table public.admin_operation_idempotency enable row level security;
alter table public.admin_roles enable row level security;
alter table public.drop_interest_requests enable row level security;
alter table public.email_delivery_events enable row level security;
alter table public.entity_events enable row level security;
alter table public.manual_shipping_quotes enable row level security;
alter table public.newsletter_signups enable row level security;
alter table public.operational_email_attempts enable row level security;
alter table public.order_invitations enable row level security;
alter table public.orders enable row level security;
alter table public.payments enable row level security;
alter table public.product_registry enable row level security;
-- Accepted authenticated read policies.
create policy admin_roles_read_own on public.admin_roles for select to authenticated
  using (user_id = (select auth.uid()) and revoked_at is null);
create policy product_registry_read_authenticated on public.product_registry for select to authenticated
  using (true);

-- Deterministic schema-bound product configuration; no customer data.
insert into public.product_registry (product_code, title, lifecycle_mode)
values ('eurofighter-typhoon-a2', 'Eurofighter Typhoon / A2', 'interest')
on conflict (product_code) do nothing;

-- Deny platform defaults first, then grant only proven application access.
revoke all on schema public from public, anon, authenticated, service_role;
revoke all on all tables in schema public from public, anon, authenticated, service_role;
revoke all on all sequences in schema public from public, anon, authenticated, service_role;
revoke all on all functions in schema public from public, anon, authenticated, service_role;

grant usage on schema public to authenticated, service_role;

-- Authenticated Data API reads are constrained by the two RLS policies above.
grant select on table public.admin_roles, public.product_registry to authenticated;

-- Direct serverless REST callers using the server-only service role.
grant select, insert on table public.drop_interest_requests to service_role;
grant insert on table public.newsletter_signups to service_role;
grant select, update on table public.order_invitations to service_role;
grant select, insert, update on table public.orders, public.payments to service_role;
grant select on table
  public.admin_roles,
  public.admin_audit_events,
  public.entity_events,
  public.product_registry,
  public.manual_shipping_quotes,
  public.operational_email_attempts,
  public.email_delivery_events
to service_role;
grant select on table
  public.admin_reservation_list_v1,
  public.admin_invitation_list_v1,
  public.admin_order_list_v1,
  public.admin_payment_list_v1
to service_role;

-- Server-side privileged RPC surface. Trigger and helper functions remain owner-only.
grant execute on function public.payment_start_claim(uuid,text,uuid,jsonb) to service_role;
grant execute on function public.payment_start_begin_provider(uuid,text,uuid) to service_role;
grant execute on function public.payment_start_complete(uuid,text,uuid,text,text,numeric,text,text,text,jsonb) to service_role;
grant execute on function public.payment_start_mark_reconciliation(uuid,text,uuid) to service_role;
grant execute on function public.admin_a3_replay_action(uuid,text,text,text) to service_role;
grant execute on function public.admin_a3_preview_action(uuid,text,jsonb) to service_role;
grant execute on function public.admin_a3_apply_action(uuid,text,text,text,jsonb,jsonb) to service_role;
grant execute on function public.admin_a3_claim_delivery(uuid,uuid,uuid) to service_role;
grant execute on function public.admin_a3_delivery_payload(uuid,uuid,uuid) to service_role;
grant execute on function public.admin_a3_complete_delivery(uuid,text,text,text,uuid,uuid,text,text) to service_role;
grant execute on function public.admin_a31_preview_origin_change(uuid,uuid,public.record_origin,bigint,text) to service_role;
grant execute on function public.admin_a31_change_origin(uuid,text,text,uuid,public.record_origin,bigint,text,text) to service_role;
grant execute on function public.admin_a31_assert_shipping_ready(uuid,uuid) to service_role;
grant execute on function public.admin_a32_preview_action(uuid,text,jsonb) to service_role;
grant execute on function public.admin_a32_apply_action(uuid,text,text,text,jsonb,jsonb,text) to service_role;
grant execute on function public.admin_a32_change_origin(uuid,text,text,uuid,public.record_origin,bigint,text,text) to service_role;
grant execute on function public.admin_a32_claim_delivery(uuid,uuid,uuid) to service_role;
grant execute on function public.admin_a32_delivery_payload(uuid,uuid,uuid) to service_role;
grant execute on function public.admin_a32_complete_delivery(uuid,text,text,text,uuid,uuid,text,text) to service_role;

commit;
