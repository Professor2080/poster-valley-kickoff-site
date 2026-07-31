-- A3 additive operational state. Apply to the isolated staging project first.
-- No production migration is authorized by this file.

create table if not exists public.manual_shipping_quotes (
  id uuid primary key default gen_random_uuid(),
  invitation_id uuid not null references public.order_invitations(id) on delete cascade,
  country_code text not null check (country_code ~ '^[A-Z]{2}$'),
  shipping_amount numeric(10,2) not null check (shipping_amount >= 0),
  currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  expires_at timestamptz not null,
  status text not null default 'approved' check (status in ('approved', 'expired', 'cancelled')),
  approved_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists manual_shipping_quotes_invitation_idx on public.manual_shipping_quotes(invitation_id, created_at desc);
create unique index if not exists manual_shipping_quotes_one_active_idx on public.manual_shipping_quotes(invitation_id) where status = 'approved';
alter table public.manual_shipping_quotes enable row level security;

alter table public.orders add column if not exists fulfilment_status text not null default 'unfulfilled'
  check (fulfilment_status in ('unfulfilled', 'ready_to_pack', 'packed', 'shipped'));
alter table public.orders add column if not exists fulfilment_version bigint not null default 0 check (fulfilment_version >= 0);
alter table public.orders add column if not exists carrier text;
alter table public.orders add column if not exists tracking_number text;
alter table public.orders add column if not exists shipped_at timestamptz;
alter table public.orders add column if not exists shipping_email_status text not null default 'not_prepared'
  check (shipping_email_status in ('not_prepared','pending','suppressed','sent','failed'));
alter table public.orders add column if not exists manual_shipping_quote_id uuid references public.manual_shipping_quotes(id) on delete restrict;
alter table public.orders drop constraint if exists orders_shipped_details_check;
alter table public.orders add constraint orders_shipped_details_check check (
  fulfilment_status <> 'shipped' or (
    nullif(btrim(carrier), '') is not null and length(carrier) <= 120 and
    nullif(btrim(tracking_number), '') is not null and length(tracking_number) <= 160 and
    shipped_at is not null
  )
);
create index if not exists orders_fulfilment_status_idx on public.orders(fulfilment_status, updated_at desc);
create index if not exists orders_manual_quote_idx on public.orders(manual_shipping_quote_id) where manual_shipping_quote_id is not null;

create table if not exists public.operational_email_attempts (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null references auth.users(id),
  action text not null,
  idempotency_key text not null,
  template text not null check (template in ('order_invitation', 'shipping_confirmation')),
  template_version text not null default 'v1',
  entity_type text not null,
  entity_id text not null,
  token_hash text,
  expires_at timestamptz,
  delivery_status text not null default 'pending' check (delivery_status in ('pending', 'suppressed', 'sent', 'failed')),
  provider_id text,
  dispatch_claim_id uuid,
  dispatch_lease_expires_at timestamptz,
  dispatch_started_at timestamptz,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(actor_user_id, action, idempotency_key)
);
create unique index if not exists operational_email_one_pending_entity_idx
  on public.operational_email_attempts(template, entity_type, entity_id) where delivery_status = 'pending';
alter table public.operational_email_attempts enable row level security;

create table if not exists public.email_delivery_events (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  actor_user_id uuid references auth.users(id) on delete set null,
  attempt_id uuid not null unique references public.operational_email_attempts(id) on delete restrict,
  entity_type text not null,
  entity_id text not null,
  template text not null,
  template_version text not null default 'v1',
  delivery_status text not null check (delivery_status in ('suppressed', 'sent', 'failed')),
  provider_id text,
  correlation_id uuid not null,
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object')
);
create index if not exists email_delivery_events_entity_idx on public.email_delivery_events(entity_type, entity_id, occurred_at desc);
alter table public.email_delivery_events enable row level security;
drop trigger if exists email_delivery_events_no_update on public.email_delivery_events;
create trigger email_delivery_events_no_update before update or delete on public.email_delivery_events
  for each row execute function public.prevent_protected_history_mutation();

create table if not exists public.admin_operation_idempotency (
  actor_user_id uuid not null references auth.users(id),
  action text not null,
  idempotency_key text not null,
  request_hash text not null check (request_hash ~ '^[a-f0-9]{64}$'),
  result jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (actor_user_id, action, idempotency_key)
);
alter table public.admin_operation_idempotency enable row level security;

create or replace function public.validate_order_manual_quote() returns trigger
language plpgsql set search_path = public, pg_temp as $$
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
end $$;
drop trigger if exists orders_validate_manual_quote on public.orders;
create trigger orders_validate_manual_quote before insert or update of invitation_id, manual_shipping_quote_id, shipping_country_code, currency, shipping_amount on public.orders
  for each row execute function public.validate_order_manual_quote();

create or replace function public.admin_a3_replay_action(
  p_actor uuid, p_action text, p_idempotency_key text, p_request_hash text
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare prior public.admin_operation_idempotency;
begin
  if not exists(select 1 from public.admin_roles where user_id=p_actor and revoked_at is null) then raise exception using message='forbidden', errcode='P0001'; end if;
  select * into prior from public.admin_operation_idempotency
    where actor_user_id=p_actor and action=p_action and idempotency_key=p_idempotency_key;
  if not found then return jsonb_build_object('found',false); end if;
  if prior.request_hash <> p_request_hash then raise exception using message='idempotency_conflict', errcode='P0001'; end if;
  if prior.result is null then raise exception using message='operation_in_progress', errcode='P0001'; end if;
  return jsonb_build_object('found',true,'result',prior.result);
end $$;

create or replace function public.admin_a3_preview_action(p_actor uuid, p_action text, p_request jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
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
end $$;

create or replace function public.admin_a3_apply_action(
  p_actor uuid, p_action text, p_idempotency_key text, p_request_hash text, p_request jsonb, p_context jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
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
        (p_context->>'unitPrice')::numeric,(p_context->>'unitPrice')::numeric*r.quantity,'draft',encode(digest(gen_random_bytes(32),'sha256'),'hex'),(p_context->>'expiresAt')::timestamptz)
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
end $$;

create or replace function public.admin_a3_claim_delivery(p_actor uuid, p_attempt_id uuid, p_claim_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
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
end $$;

create or replace function public.admin_a3_delivery_payload(p_actor uuid, p_attempt_id uuid, p_claim_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
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
end $$;

create or replace function public.admin_a3_complete_delivery(
  p_actor uuid,p_action text,p_idempotency_key text,p_request_hash text,p_attempt_id uuid,p_claim_id uuid,p_delivery_status text,p_provider_id text default null
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
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
end $$;

revoke all on function public.admin_a3_replay_action(uuid,text,text,text) from public, anon, authenticated;
revoke all on function public.admin_a3_preview_action(uuid,text,jsonb) from public, anon, authenticated;
revoke all on function public.admin_a3_apply_action(uuid,text,text,text,jsonb,jsonb) from public, anon, authenticated;
revoke all on function public.admin_a3_claim_delivery(uuid,uuid,uuid) from public, anon, authenticated;
revoke all on function public.admin_a3_delivery_payload(uuid,uuid,uuid) from public, anon, authenticated;
revoke all on function public.admin_a3_complete_delivery(uuid,text,text,text,uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function public.admin_a3_replay_action(uuid,text,text,text) to service_role;
grant execute on function public.admin_a3_preview_action(uuid,text,jsonb) to service_role;
grant execute on function public.admin_a3_apply_action(uuid,text,text,text,jsonb,jsonb) to service_role;
grant execute on function public.admin_a3_claim_delivery(uuid,uuid,uuid) to service_role;
grant execute on function public.admin_a3_delivery_payload(uuid,uuid,uuid) to service_role;
grant execute on function public.admin_a3_complete_delivery(uuid,text,text,text,uuid,uuid,text,text) to service_role;

-- Rollback: revoke/drop the six RPCs and validation trigger/function, then remove A3 tables,
-- indexes, constraints and additive order columns. Preserve exported history before rollback.
