-- Additive runtime correction for the already-applied A3 migration.
-- Keep extension functions explicitly qualified because privileged A3 functions
-- intentionally restrict their search path to public and pg_temp.

create index if not exists manual_shipping_quotes_approved_by_idx
  on public.manual_shipping_quotes(approved_by);
create index if not exists email_delivery_events_actor_user_id_idx
  on public.email_delivery_events(actor_user_id);

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
end $$;

revoke all on function public.admin_a3_apply_action(uuid,text,text,text,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.admin_a3_apply_action(uuid,text,text,text,jsonb,jsonb) to service_role;
