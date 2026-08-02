-- A3.1 additive customer-data and record-origin foundation.
-- Apply only through the reviewed migration workflow; this file is not applied remotely by Codex.

create type public.record_origin as enum ('customer', 'test', 'internal_pilot');

alter table public.drop_interest_requests
  add column record_origin public.record_origin,
  add column record_origin_needs_review boolean,
  add column record_origin_version bigint not null default 0 check (record_origin_version >= 0);

-- Existing records are customer records unless strong evidence proves otherwise.
-- The reserved .test DNS namespace is the only automatic proof accepted here.
update public.drop_interest_requests
set record_origin = 'customer', record_origin_needs_review = true;

update public.drop_interest_requests
set record_origin = 'test', record_origin_needs_review = false
where lower(split_part(coalesce(email_normalized, email), '@', 2)) ~ '(^|[.])test$';

alter table public.drop_interest_requests
  alter column record_origin set default 'customer',
  alter column record_origin set not null,
  alter column record_origin_needs_review set default false,
  alter column record_origin_needs_review set not null;

create index drop_interest_requests_origin_idx
  on public.drop_interest_requests(record_origin, record_origin_needs_review, created_at desc);

alter table public.orders
  add column shipping_company text check (shipping_company is null or length(shipping_company) <= 160);

create index if not exists orders_interest_request_id_idx on public.orders(interest_request_id);

alter table public.operational_email_attempts
  add column interest_request_id uuid references public.drop_interest_requests(id) on delete set null;

update public.operational_email_attempts a
set interest_request_id = i.interest_request_id
from public.order_invitations i
where a.entity_type = 'order_invitation'
  and a.entity_id = i.id::text
  and a.interest_request_id is null;

update public.operational_email_attempts a
set interest_request_id = o.interest_request_id
from public.orders o
where a.entity_type = 'order'
  and a.entity_id = o.id::text
  and a.interest_request_id is null;

create index operational_email_attempts_interest_request_idx
  on public.operational_email_attempts(interest_request_id, created_at desc);

create or replace function public.admin_a31_set_email_lineage() returns trigger
language plpgsql set search_path = public, pg_temp as $$
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
end $$;

drop trigger if exists operational_email_attempts_set_lineage on public.operational_email_attempts;
create trigger operational_email_attempts_set_lineage
  before insert on public.operational_email_attempts
  for each row execute function public.admin_a31_set_email_lineage();

create or replace function public.admin_a31_order_address_complete(p_order public.orders) returns boolean
language sql immutable set search_path = public, pg_temp as $$
  select
    nullif(btrim(p_order.shipping_name), '') is not null and
    nullif(btrim(p_order.email), '') is not null and
    p_order.email ~* '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' and
    nullif(btrim(p_order.address_line1), '') is not null and
    nullif(btrim(p_order.postal_code), '') is not null and
    nullif(btrim(p_order.city), '') is not null and
    p_order.shipping_country_code ~ '^[A-Z]{2}$' and
    (p_order.shipping_country_code not in ('US', 'CA', 'AU') or nullif(btrim(p_order.region), '') is not null)
$$;

create or replace function public.admin_a31_enforce_shipping_address() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if new.fulfilment_status = 'shipped' and not public.admin_a31_order_address_complete(new) then
    raise exception using message = 'shipping_address_incomplete', errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists orders_require_complete_shipping_address on public.orders;
create trigger orders_require_complete_shipping_address
  before insert or update on public.orders
  for each row execute function public.admin_a31_enforce_shipping_address();

create or replace function public.admin_a31_protect_paid_address() returns trigger
language plpgsql set search_path = public, pg_temp as $$
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
end $$;

drop trigger if exists orders_protect_paid_address on public.orders;
create trigger orders_protect_paid_address
  before update of email, first_name, last_name, shipping_name, shipping_company,
    address_line1, address_line2, postal_code, city, region, shipping_country, shipping_country_code
  on public.orders for each row execute function public.admin_a31_protect_paid_address();

create or replace function public.admin_a31_assert_shipping_ready(p_actor uuid, p_order_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
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
end $$;

-- Service-only, security-invoker list projections keep PII out of generic reads.
create view public.admin_reservation_list_v1 with (security_invoker = true) as
select r.id, r.created_at, r.drop_slug, r.drop_title,
  coalesce(nullif(btrim(r.full_name), ''), concat_ws(' ', r.first_name, r.last_name)) as customer_name,
  case when position('@' in r.email) > 1
    then left(r.email, 1) || '***@' || split_part(r.email, '@', 2)
    else '***' end as masked_email,
  r.preferred_format, r.quantity, r.country_code, r.status, r.reservation_status,
  r.record_origin, r.record_origin_needs_review, r.record_origin_version
from public.drop_interest_requests r;

create view public.admin_invitation_list_v1 with (security_invoker = true) as
select i.id, i.interest_request_id, i.drop_slug, i.drop_title, i.quantity, i.currency,
  i.unit_price, i.subtotal_amount, i.status, i.expires_at, i.sent_at, i.created_at, i.updated_at,
  coalesce(r.record_origin, 'customer'::public.record_origin) as record_origin,
  coalesce(r.record_origin_needs_review, true) as record_origin_needs_review
from public.order_invitations i
left join public.drop_interest_requests r on r.id = i.interest_request_id;

create view public.admin_order_list_v1 with (security_invoker = true) as
select o.id, o.invitation_id, o.interest_request_id, o.drop_slug, o.drop_title,
  concat_ws(' ', o.first_name, o.last_name) as customer_name,
  o.status, latest_payment.status as payment_status, o.fulfilment_status, o.fulfilment_version,
  o.carrier, o.tracking_number, o.shipped_at, o.shipping_email_status,
  o.quantity, o.currency, o.subtotal_amount, o.shipping_amount, o.total_amount,
  o.shipping_country_code, o.created_at, o.updated_at,
  coalesce(r.record_origin, 'customer'::public.record_origin) as record_origin,
  coalesce(r.record_origin_needs_review, true) as record_origin_needs_review
from public.orders o
left join public.drop_interest_requests r on r.id = o.interest_request_id
left join lateral (
  select p.status from public.payments p where p.order_id = o.id order by p.created_at desc limit 1
) latest_payment on true;

create view public.admin_payment_list_v1 with (security_invoker = true) as
select p.id, p.order_id, p.provider, p.status, p.amount, p.currency,
  p.webhook_received_at, p.paid_at, p.created_at, p.updated_at,
  coalesce(r.record_origin, 'customer'::public.record_origin) as record_origin,
  coalesce(r.record_origin_needs_review, true) as record_origin_needs_review
from public.payments p
join public.orders o on o.id = p.order_id
left join public.drop_interest_requests r on r.id = o.interest_request_id;

revoke all on public.admin_reservation_list_v1, public.admin_invitation_list_v1,
  public.admin_order_list_v1, public.admin_payment_list_v1 from public, anon, authenticated;
grant select on public.admin_reservation_list_v1, public.admin_invitation_list_v1,
  public.admin_order_list_v1, public.admin_payment_list_v1 to service_role;

create or replace function public.admin_a31_preview_origin_change(
  p_actor uuid, p_reservation_id uuid, p_new_origin public.record_origin,
  p_expected_version bigint, p_reason text
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
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
end $$;

create or replace function public.admin_a31_change_origin(
  p_actor uuid, p_idempotency_key text, p_request_hash text, p_reservation_id uuid,
  p_new_origin public.record_origin, p_expected_version bigint, p_reason text, p_confirmation text
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
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
end $$;

revoke all on function public.admin_a31_preview_origin_change(uuid,uuid,public.record_origin,bigint,text) from public, anon, authenticated;
revoke all on function public.admin_a31_change_origin(uuid,text,text,uuid,public.record_origin,bigint,text,text) from public, anon, authenticated;
revoke all on function public.admin_a31_assert_shipping_ready(uuid,uuid) from public, anon, authenticated;
grant execute on function public.admin_a31_preview_origin_change(uuid,uuid,public.record_origin,bigint,text) to service_role;
grant execute on function public.admin_a31_change_origin(uuid,text,text,uuid,public.record_origin,bigint,text,text) to service_role;
grant execute on function public.admin_a31_assert_shipping_ready(uuid,uuid) to service_role;
