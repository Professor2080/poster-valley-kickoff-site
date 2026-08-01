-- PR #20 Production alignment candidate.
--
-- This file is intentionally outside supabase/migrations/. It must never be picked up by
-- `supabase db push`. It is a review candidate only and does not authorize Production execution.
-- The exact project ref (epqpeoubkbftcvxjbqeo), Git SHA, migration history and aggregate data
-- gates must be rechecked immediately before a separately approved execution.

begin;

set local lock_timeout = '10s';
set local statement_timeout = '120s';
set local search_path = pg_catalog, public, extensions;

-- Serialize the final cardinality check with legacy order/payment writes. The lock is held only
-- for this transaction; no provider call or application deployment belongs in this transaction.
lock table public.order_invitations, public.orders, public.payments in share row exclusive mode;

do $alignment_preflight$
declare
  history_versions text[];
  catalog_counts jsonb;
begin
  select array_agg(version::text order by version::text)
    into history_versions
    from supabase_migrations.schema_migrations;

  if history_versions is distinct from array[
    '20260707234351',
    '20260720212806',
    '20260720212813',
    '20260720212838',
    '20260720212845',
    '20260721093937',
    '20260721155649'
  ]::text[] then
    raise exception using message = 'pr20_alignment_unexpected_migration_history', errcode = 'P0001';
  end if;

  select jsonb_build_object(
    'tables', (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'),
    'views', (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='v'),
    'enums', (select count(distinct t.oid) from pg_type t join pg_namespace n on n.oid=t.typnamespace where n.nspname='public' and t.typtype='e'),
    'routines', (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'),
    'triggers', (select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and not t.tgisinternal),
    'policies', (select count(*) from pg_policy p join pg_class c on c.oid=p.polrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'),
    'indexes', (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='i'),
    'constraints', (select count(*) from pg_constraint c join pg_namespace n on n.oid=c.connamespace where n.nspname='public')
  ) into catalog_counts;

  if catalog_counts is distinct from '{"tables":13,"views":4,"enums":2,"routines":23,"triggers":9,"policies":2,"indexes":56,"constraints":71}'::jsonb then
    raise exception using message = 'pr20_alignment_unexpected_catalog_shape', errcode = 'P0001';
  end if;

  if not exists (
    select 1 from pg_extension e join pg_namespace n on n.oid=e.extnamespace
    where e.extname='pgcrypto' and n.nspname='extensions'
  ) or not exists (
    select 1 from pg_extension e join pg_namespace n on n.oid=e.extnamespace
    where e.extname='uuid-ossp' and n.nspname='extensions'
  ) then
    raise exception using message = 'pr20_alignment_required_extensions_missing', errcode = 'P0001';
  end if;

  if (
    select count(*)
    from pg_attribute a
    join pg_class c on c.oid=a.attrelid
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='orders' and a.attnum>0 and not a.attisdropped
      and a.attname in (
        'payment_request_hash', 'payment_provider_idempotency_key', 'payment_start_status',
        'payment_claim_id', 'payment_claim_expires_at', 'payment_provider_started_at',
        'payment_reconciliation_required_at'
      )
  ) <> 0 then
    raise exception using message = 'pr20_alignment_payment_columns_partially_or_fully_present', errcode = 'P0001';
  end if;

  if exists (
    select 1 from pg_constraint c join pg_namespace n on n.oid=c.connamespace
    where n.nspname='public' and c.conname in (
      'orders_invitation_id_key', 'orders_payment_provider_idempotency_key_key',
      'orders_payment_request_hash_check', 'orders_payment_start_state_check',
      'payments_order_id_provider_key'
    )
  ) or exists (
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in (
      'payment_start_claim', 'payment_start_begin_provider', 'payment_start_complete',
      'payment_start_mark_reconciliation', 'payment_start_legacy_compat_defaults'
    )
  ) then
    raise exception using message = 'pr20_alignment_candidate_objects_partially_or_fully_present', errcode = 'P0001';
  end if;

  if exists (select 1 from public.orders group by invitation_id having count(*) > 1) then
    raise exception using message = 'pr20_alignment_duplicate_orders_per_invitation', errcode = 'P0001';
  end if;
  if exists (select 1 from public.payments group by order_id, provider having count(*) > 1) then
    raise exception using message = 'pr20_alignment_duplicate_payments_per_order_provider', errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.orders o left join public.order_invitations i on i.id=o.invitation_id
    where o.invitation_id is null or i.id is null
  ) then
    raise exception using message = 'pr20_alignment_order_without_valid_invitation', errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.payments p left join public.orders o on o.id=p.order_id
    where p.order_id is null or o.id is null
  ) then
    raise exception using message = 'pr20_alignment_payment_without_valid_order', errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.orders
    where quantity is null or quantity <= 0 or unit_price is null or subtotal_amount is null
      or shipping_amount is null or total_amount is null or currency is null or email is null
      or first_name is null or last_name is null or shipping_name is null or address_line1 is null
      or postal_code is null or city is null or shipping_country_code is null
      or accepted_terms_at is null
  ) then
    raise exception using message = 'pr20_alignment_order_backfill_input_incomplete', errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.payments
    where provider is distinct from 'mollie' or provider_payment_id !~ '^tr_[A-Za-z0-9]+$'
      or length(provider_payment_id)>200
  ) then
    raise exception using message = 'pr20_alignment_unexpected_payment_provider_shape', errcode = 'P0001';
  end if;
end
$alignment_preflight$;

alter table public.orders
  add column payment_request_hash text,
  add column payment_provider_idempotency_key uuid default gen_random_uuid(),
  add column payment_start_status text,
  add column payment_claim_id uuid,
  add column payment_claim_expires_at timestamp with time zone,
  add column payment_provider_started_at timestamp with time zone,
  add column payment_reconciliation_required_at timestamp with time zone;

-- Reconstruct the application v1 fingerprint from the server-authoritative order snapshot. The
-- preflight proves that the stored invitation economics and normalized values are compatible.
with fingerprints as (
  select
    o.id,
    encode(extensions.digest(convert_to(
      '{"version":1,"invitationId":' || to_json(i.id::text)::text ||
      ',"quantity":' || i.quantity::text ||
      ',"currency":' || to_json(upper(regexp_replace(btrim(normalize(o.currency,NFKC)), E'\\s+', ' ', 'g')))::text ||
      ',"unitPriceCents":' || round(o.unit_price*100)::bigint::text ||
      ',"subtotalCents":' || round(o.subtotal_amount*100)::bigint::text ||
      ',"shippingCents":' || round(o.shipping_amount*100)::bigint::text ||
      ',"totalCents":' || round(o.total_amount*100)::bigint::text ||
      ',"shippingCountryCode":' || to_json(upper(regexp_replace(btrim(normalize(o.shipping_country_code,NFKC)), E'\\s+', ' ', 'g')))::text ||
      ',"shippingProfileId":' || to_json(regexp_replace(btrim(normalize(o.shipping_profile_id,NFKC)), E'\\s+', ' ', 'g'))::text ||
      ',"manualQuoteId":' || case when o.manual_shipping_quote_id is null then 'null' else to_json(o.manual_shipping_quote_id::text)::text end ||
      ',"acceptedTerms":true,"address":{"firstName":' || to_json(regexp_replace(btrim(normalize(o.first_name,NFKC)), E'\\s+', ' ', 'g'))::text ||
      ',"lastName":' || to_json(regexp_replace(btrim(normalize(o.last_name,NFKC)), E'\\s+', ' ', 'g'))::text ||
      ',"email":' || to_json(lower(regexp_replace(btrim(normalize(o.email,NFKC)), E'\\s+', ' ', 'g')))::text ||
      ',"shippingName":' || to_json(regexp_replace(btrim(normalize(o.shipping_name,NFKC)), E'\\s+', ' ', 'g'))::text ||
      ',"company":' || to_json(regexp_replace(btrim(normalize(coalesce(o.shipping_company,''),NFKC)), E'\\s+', ' ', 'g'))::text ||
      ',"addressLine1":' || to_json(regexp_replace(btrim(normalize(o.address_line1,NFKC)), E'\\s+', ' ', 'g'))::text ||
      ',"addressLine2":' || to_json(regexp_replace(btrim(normalize(coalesce(o.address_line2,''),NFKC)), E'\\s+', ' ', 'g'))::text ||
      ',"postalCode":' || to_json(upper(regexp_replace(btrim(normalize(o.postal_code,NFKC)), E'\\s+', ' ', 'g')))::text ||
      ',"city":' || to_json(regexp_replace(btrim(normalize(o.city,NFKC)), E'\\s+', ' ', 'g'))::text ||
      ',"region":' || to_json(regexp_replace(btrim(normalize(coalesce(o.region,''),NFKC)), E'\\s+', ' ', 'g'))::text ||
      ',"countryCode":' || to_json(upper(regexp_replace(btrim(normalize(o.shipping_country_code,NFKC)), E'\\s+', ' ', 'g')))::text ||
      '}}', 'UTF8'), 'sha256'), 'hex') request_hash
  from public.orders o
  join public.order_invitations i on i.id=o.invitation_id
)
update public.orders o
set payment_request_hash = f.request_hash,
    payment_provider_idempotency_key = extensions.uuid_generate_v5(
      '6ba7b811-9dad-11d1-80b4-00c04fd430c8'::uuid,
      'poster-valley/pr20/payment-provider/' || o.id::text
    ),
    payment_start_status = case
      when exists (select 1 from public.payments p where p.order_id=o.id and p.provider='mollie')
        then 'provider_created'
      else 'reconciliation_required'
    end,
    payment_claim_id = null,
    payment_claim_expires_at = null,
    payment_provider_started_at = coalesce(
      (select min(p.created_at) from public.payments p where p.order_id=o.id and p.provider='mollie'),
      o.created_at,
      now()
    ),
    payment_reconciliation_required_at = case
      when exists (select 1 from public.payments p where p.order_id=o.id and p.provider='mollie')
        then null
      else coalesce(o.created_at,now())
    end
from fingerprints f
where f.id=o.id;

-- Temporary expand-phase compatibility for the old Production create-payment caller. New PR #20
-- RPC inserts provide both fields and pass through unchanged. A later contract release removes
-- this trigger/function only after the PR #20 deployment is confirmed healthy.
create function public.payment_start_legacy_compat_defaults()
returns trigger
language plpgsql
security invoker
set search_path to ''
as $function$
begin
  if (new.payment_request_hash is null) <> (new.payment_start_status is null) then
    raise exception using message='payment_legacy_partial_idempotency_state', errcode='P0001';
  end if;

  if new.payment_request_hash is null then
    new.payment_request_hash := pg_catalog.encode(
      extensions.digest(
        pg_catalog.convert_to(
          'poster-valley-payment-request-legacy-insert-v1|' ||
          coalesce(new.id::text,'missing-id') || '|' ||
          coalesce(new.invitation_id::text,'missing-invitation'),
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    );
    new.payment_start_status := 'reconciliation_required';
    new.payment_claim_id := null;
    new.payment_claim_expires_at := null;
    new.payment_provider_started_at := coalesce(new.created_at,pg_catalog.now());
    new.payment_reconciliation_required_at := coalesce(new.created_at,pg_catalog.now());
  end if;

  return new;
end
$function$;

create trigger payment_start_legacy_compat_defaults_before_insert
before insert on public.orders
for each row execute function public.payment_start_legacy_compat_defaults();

alter table public.orders
  alter column payment_request_hash set not null,
  alter column payment_provider_idempotency_key set not null,
  alter column payment_start_status set not null;

alter table public.orders
  add constraint orders_payment_request_hash_check
    check (payment_request_hash ~ '^[a-f0-9]{64}$'::text) not valid,
  add constraint orders_payment_start_state_check
    check (
      (payment_start_status='claimed'::text and payment_claim_id is not null and payment_claim_expires_at is not null and payment_provider_started_at is null and payment_reconciliation_required_at is null)
      or (payment_start_status='provider_pending'::text and payment_claim_id is not null and payment_claim_expires_at is null and payment_provider_started_at is not null and payment_reconciliation_required_at is null)
      or (payment_start_status='provider_created'::text and payment_claim_id is null and payment_claim_expires_at is null and payment_provider_started_at is not null and payment_reconciliation_required_at is null)
      or (payment_start_status='reconciliation_required'::text and payment_claim_id is null and payment_claim_expires_at is null and payment_provider_started_at is not null and payment_reconciliation_required_at is not null)
    ) not valid;

alter table public.orders validate constraint orders_payment_request_hash_check;
alter table public.orders validate constraint orders_payment_start_state_check;

alter table public.orders
  add constraint orders_invitation_id_key unique (invitation_id),
  add constraint orders_payment_provider_idempotency_key_key unique (payment_provider_idempotency_key);

alter table public.payments
  add constraint payments_order_id_provider_key unique (order_id, provider);

-- These four definitions are copied from the immutable PR #20 canonical baseline.
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

-- Existing-object hardening and the minimal application grant matrix from the canonical baseline.
revoke all on schema public from public, anon, authenticated, service_role;
revoke all on all tables in schema public from public, anon, authenticated, service_role;
revoke all on all sequences in schema public from public, anon, authenticated, service_role;
revoke all on all functions in schema public from public, anon, authenticated, service_role;

grant usage on schema public to authenticated, service_role;
grant select on table public.admin_roles, public.product_registry to authenticated;
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

-- Future postgres-owned public objects are deny-by-default. Supabase-managed supabase_admin
-- defaults are platform-owned and intentionally not rewritten by this application candidate.
alter default privileges for role postgres in schema public
  revoke select, insert, update, delete on tables
  from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke truncate, references, trigger, maintain on tables
  from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke execute on functions
  from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke usage, select, update on sequences
  from public, anon, authenticated, service_role;
alter default privileges for role postgres
  revoke execute on functions
  from public;

do $alignment_postcheck$
declare
  counts jsonb;
begin
  select jsonb_build_object(
    'tables', (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'),
    'views', (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='v'),
    'enums', (select count(distinct t.oid) from pg_type t join pg_namespace n on n.oid=t.typnamespace where n.nspname='public' and t.typtype='e'),
    'routines', (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'),
    'triggers', (select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and not t.tgisinternal),
    'policies', (select count(*) from pg_policy p join pg_class c on c.oid=p.polrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'),
    'indexes', (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='i'),
    'constraints', (select count(*) from pg_constraint c join pg_namespace n on n.oid=c.connamespace where n.nspname='public')
  ) into counts;

  -- 28 routines and 10 triggers intentionally include the one temporary legacy compatibility
  -- function/trigger. The two pre-existing redundant lookup indexes are retained, so indexes=59.
  if counts is distinct from '{"tables":13,"views":4,"enums":2,"routines":28,"triggers":10,"policies":2,"indexes":59,"constraints":76}'::jsonb then
    raise exception using message = 'pr20_alignment_unexpected_post_catalog_shape', errcode = 'P0001';
  end if;

  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname like 'payment_start_%'
      and p.proname <> 'payment_start_legacy_compat_defaults'
      and (not p.prosecdef or p.proconfig is distinct from array['search_path=""']::text[])
  ) then
    raise exception using message = 'pr20_alignment_payment_rpc_security_contract_failed', errcode = 'P0001';
  end if;

  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    cross join lateral aclexplode(p.proacl) a
    where n.nspname='public' and p.proname like 'payment_start_%'
      and p.proname <> 'payment_start_legacy_compat_defaults'
      and (case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end) <> 'service_role'
      and (case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end) <> 'postgres'
  ) then
    raise exception using message = 'pr20_alignment_payment_rpc_grant_contract_failed', errcode = 'P0001';
  end if;
end
$alignment_postcheck$;

commit;
