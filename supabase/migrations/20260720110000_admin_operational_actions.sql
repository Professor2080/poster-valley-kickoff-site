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
create unique index if not exists manual_shipping_quotes_one_active_idx on public.manual_shipping_quotes(invitation_id)
  where status = 'approved';
alter table public.manual_shipping_quotes enable row level security;

create table if not exists public.email_delivery_events (
  id uuid primary key default gen_random_uuid(), occurred_at timestamptz not null default now(),
  entity_type text not null, entity_id text not null, template text not null,
  delivery_status text not null check (delivery_status in ('suppressed', 'sent', 'failed')),
  correlation_id uuid, details jsonb not null default '{}'::jsonb
);
create index if not exists email_delivery_events_entity_idx on public.email_delivery_events(entity_type, entity_id, occurred_at desc);
alter table public.email_delivery_events enable row level security;

create table if not exists public.admin_operation_idempotency (
  actor_user_id uuid not null references auth.users(id), action text not null, idempotency_key text not null,
  request_hash text not null, result jsonb, created_at timestamptz not null default now(), completed_at timestamptz,
  primary key (actor_user_id, action, idempotency_key)
);
alter table public.admin_operation_idempotency enable row level security;

-- Server-only transactional action boundary. It claims the key before every
-- mutation and stores the response in the same transaction as history.
create or replace function public.admin_a3_preview_invitation(p_reservation_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.drop_interest_requests; d record;
begin
 select * into r from public.drop_interest_requests where id=p_reservation_id;
 if not found then raise exception 'not_found'; end if;
 select * into d from public.product_registry where product_code='eurofighter-typhoon-a2';
 if r.reservation_status in ('converted','cancelled') or not found then raise exception 'invalid_transition'; end if;
 return jsonb_build_object('success',true,'preview',jsonb_build_object('reservationId',r.id,'quantity',r.quantity,'dropSlug',r.drop_slug));
end $$;

create or replace function public.admin_a3_apply_action(p_actor uuid,p_action text,p_idempotency_key text,p_request_hash text,p_request jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare prior public.admin_operation_idempotency; v_result jsonb; rid uuid; iid uuid; oid uuid; qid uuid; current_status text; target text; now_at timestamptz := now();
begin
 if not exists (select 1 from public.admin_roles where user_id=p_actor and revoked_at is null) then raise exception 'forbidden'; end if;
 if p_action='quote.approve' and not exists (select 1 from public.admin_roles where user_id=p_actor and role='manager' and revoked_at is null) then raise exception 'insufficient_role'; end if;
 select * into prior from public.admin_operation_idempotency where actor_user_id=p_actor and action=p_action and idempotency_key=p_idempotency_key for update;
 if found then
   if prior.request_hash <> p_request_hash then raise exception 'idempotency_conflict' using errcode='P0001'; end if;
   if prior.result is null then raise exception 'operation_in_progress' using errcode='P0001'; end if;
   return prior.result;
 end if;
 insert into public.admin_operation_idempotency(actor_user_id,action,idempotency_key,request_hash) values(p_actor,p_action,p_idempotency_key,p_request_hash);
 if p_action='invitation.prepare' then
   rid := (p_request->>'reservationId')::uuid;
   select id into iid from public.order_invitations where interest_request_id=rid and status='draft' order by created_at desc limit 1 for update;
   if iid is null then raise exception 'invitation_not_prepared'; end if;
   -- Delivery is intentionally suppressed: do not mark sent or update reservation lifecycle.
   insert into public.email_delivery_events(entity_type,entity_id,template,delivery_status,details) values('order_invitation',iid::text,'order_invitation','suppressed',jsonb_build_object('reason','delivery_disabled'));
   v_result := jsonb_build_object('success',true,'outcome','suppressed','invitationId',iid);
   insert into public.admin_audit_events(actor_user_id,action,entity_type,entity_id,idempotency_key,details) values(p_actor,'invitation.prepared','order_invitation',iid::text,p_idempotency_key,jsonb_build_object('delivery','suppressed'));
   insert into public.entity_events(actor_user_id,source,event_type,entity_type,entity_id,idempotency_key,payload) values(p_actor,'admin','invitation.prepared','order_invitation',iid::text,p_idempotency_key,jsonb_build_object('delivery','suppressed'));
 elsif p_action='quote.approve' then
   iid := (p_request->>'invitationId')::uuid;
   if not exists(select 1 from public.order_invitations where id=iid and status in ('draft','sent','opened','order_started')) then raise exception 'invalid_invitation'; end if;
   update public.manual_shipping_quotes set status='cancelled' where invitation_id=iid and status='approved';
   insert into public.manual_shipping_quotes(invitation_id,country_code,shipping_amount,currency,expires_at,approved_by) values(iid,upper(p_request->>'countryCode'),(p_request->>'shippingAmount')::numeric,'EUR',(p_request->>'expiresAt')::timestamptz,p_actor) returning id into qid;
   if (select expires_at <= now() from public.manual_shipping_quotes where id=qid) then raise exception 'invalid_expiry'; end if;
   v_result:=jsonb_build_object('success',true,'quoteId',qid);
   insert into public.admin_audit_events(actor_user_id,action,entity_type,entity_id,idempotency_key,details) values(p_actor,'quote.approved','manual_shipping_quote',qid::text,p_idempotency_key,jsonb_build_object('invitation_id',iid));
   insert into public.entity_events(actor_user_id,source,event_type,entity_type,entity_id,idempotency_key,payload) values(p_actor,'admin','quote.approved','manual_shipping_quote',qid::text,p_idempotency_key,'{}');
 elsif p_action='fulfilment.transition' then
   oid := (p_request->>'orderId')::uuid; target:=p_request->>'targetStatus';
   select fulfilment_status into current_status from public.orders where id=oid and status='paid' for update;
   if not found then raise exception 'payment_not_confirmed'; end if;
   if not ((current_status='unfulfilled' and target='ready_to_pack') or (current_status='ready_to_pack' and target='packed') or (current_status='packed' and target='shipped')) then raise exception 'invalid_transition'; end if;
   update public.orders set fulfilment_status=target,carrier=case when target='shipped' then p_request->>'carrier' else carrier end,tracking_number=case when target='shipped' then p_request->>'trackingNumber' else tracking_number end,shipped_at=case when target='shipped' then now_at else shipped_at end,updated_at=now_at where id=oid;
   if target='shipped' and (coalesce(p_request->>'carrier','')='' or coalesce(p_request->>'trackingNumber','')='') then raise exception 'tracking_required'; end if;
   v_result:=jsonb_build_object('success',true,'fulfilmentStatus',target);
   insert into public.admin_audit_events(actor_user_id,action,entity_type,entity_id,idempotency_key,details) values(p_actor,'fulfilment.'||target,'order',oid::text,p_idempotency_key,jsonb_build_object('carrier',p_request->>'carrier'));
   insert into public.entity_events(actor_user_id,source,event_type,entity_type,entity_id,idempotency_key,payload) values(p_actor,'admin','fulfilment.'||target,'order',oid::text,p_idempotency_key,'{}');
 else raise exception 'invalid_action'; end if;
 update public.admin_operation_idempotency set result=v_result,completed_at=now() where actor_user_id=p_actor and action=p_action and idempotency_key=p_idempotency_key;
 return v_result;
end $$;
revoke all on function public.admin_a3_preview_invitation(uuid) from public, anon, authenticated;
revoke all on function public.admin_a3_apply_action(uuid,text,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.admin_a3_preview_invitation(uuid) to service_role;
grant execute on function public.admin_a3_apply_action(uuid,text,text,text,jsonb) to service_role;
-- Rollback: revoke/drop functions and idempotency table, then A3 tables and four orders columns. No backfill required; old orders remain unfulfilled.
