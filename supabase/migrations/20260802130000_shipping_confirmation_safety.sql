-- Additive shipping-confirmation authorization and concurrency hardening.
-- This migration is intentionally not applied remotely by Codex.

alter table public.operational_email_attempts
  add column if not exists reconciliation_required boolean not null default false;
alter table public.operational_email_attempts
  drop constraint if exists operational_email_attempts_reconciliation_pending_check;
alter table public.operational_email_attempts
  add constraint operational_email_attempts_reconciliation_pending_check
  check (not reconciliation_required or delivery_status = 'pending');

create or replace view public.admin_order_list_v1 with (security_invoker = true) as
select o.id, o.invitation_id, o.interest_request_id, o.drop_slug, o.drop_title,
  concat_ws(' ', o.first_name, o.last_name) as customer_name,
  o.status, latest_payment.status as payment_status, o.fulfilment_status, o.fulfilment_version,
  o.carrier, o.tracking_number, o.shipped_at, o.shipping_email_status,
  o.quantity, o.currency, o.subtotal_amount, o.shipping_amount, o.total_amount,
  o.shipping_country_code, o.created_at, o.updated_at,
  coalesce(r.record_origin, 'customer'::public.record_origin) as record_origin,
  coalesce(r.record_origin_needs_review, true) as record_origin_needs_review,
  coalesce(
    latest_shipping.reconciliation_required
      or (
        latest_shipping.delivery_status = 'pending'
        and latest_shipping.dispatch_started_at <= now() - interval '23 hours'
      ),
    false
  ) as shipping_reconciliation_required
from public.orders o
left join public.drop_interest_requests r on r.id = o.interest_request_id
left join lateral (
  select p.status from public.payments p where p.order_id = o.id order by p.created_at desc limit 1
) latest_payment on true
left join lateral (
  select a.delivery_status, a.dispatch_started_at, a.reconciliation_required
  from public.operational_email_attempts a
  where a.template = 'shipping_confirmation' and a.entity_type = 'order' and a.entity_id = o.id::text
  order by a.created_at desc limit 1
) latest_shipping on true;
revoke all on public.admin_order_list_v1 from public, anon, authenticated;
grant select on public.admin_order_list_v1 to service_role;

create or replace function public.admin_shipping_confirmation_guard(
  p_actor uuid, p_action text, p_request jsonb, p_lock boolean default false
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  o public.orders;
  pay public.payments;
  a public.operational_email_attempts;
  is_shipping_retry boolean := p_action in ('shipping.preview', 'shipping.retry');
  is_reconciliation boolean := p_action in (
    'shipping.reconciliation.preview', 'shipping.reconciliation.resolve'
  );
  is_shipping_action boolean := is_shipping_retry or is_reconciliation;
  is_ship_transition boolean := p_action in ('fulfilment.preview', 'fulfilment.transition')
    and p_request->>'targetStatus' = 'shipped';
begin
  if not is_shipping_action and not is_ship_transition then return; end if;

  if not exists (
    select 1 from public.admin_roles
    where user_id = p_actor and role = 'manager' and revoked_at is null
  ) then
    raise exception using message = 'insufficient_role', errcode = 'P0001';
  end if;

  if coalesce(p_request->>'expectedStatus', '') = ''
     or coalesce(p_request->>'expectedVersion', '') !~ '^[0-9]+$' then
    raise exception using message = 'stale_transition', errcode = 'P0001';
  end if;

  if is_reconciliation and (
    coalesce(p_request->>'reconciliationOutcome', '') not in (
      'provider_acceptance_confirmed', 'provider_non_acceptance_confirmed'
    )
    or coalesce(length(btrim(p_request->>'evidenceNote')), 0) not between 10 and 500
    or p_request->>'evidenceNote' ~ '[[:cntrl:]]'
    or position('@' in p_request->>'evidenceNote') > 0
    or p_request->>'evidenceNote' ~* 'https?://|www\.'
    or p_request->>'evidenceNote' !~ '^[A-Za-z][A-Za-z .,;:()''/-]*$'
  ) then
    raise exception using message = 'invalid_reconciliation_evidence', errcode = 'P0001';
  end if;

  if p_lock then
    select * into o from public.orders
    where id = (p_request->>'orderId')::uuid for update;
  else
    select * into o from public.orders
    where id = (p_request->>'orderId')::uuid;
  end if;
  if not found then raise exception using message = 'not_found', errcode = 'P0001'; end if;

  if o.fulfilment_status <> p_request->>'expectedStatus'
     or o.fulfilment_version <> (p_request->>'expectedVersion')::bigint then
    raise exception using message = 'stale_transition', errcode = 'P0001';
  end if;

  if is_shipping_action and o.fulfilment_status <> 'shipped' then
    raise exception using message = 'invalid_transition', errcode = 'P0001';
  end if;

  if is_shipping_action then
    if p_lock then
      select * into pay from public.payments
      where order_id = o.id and provider = 'mollie' and status = 'paid'
        and provider_payment_id is not null and webhook_received_at is not null and paid_at is not null
        and amount = o.total_amount and currency = o.currency
      order by paid_at desc limit 1 for update;
    else
      select * into pay from public.payments
      where order_id = o.id and provider = 'mollie' and status = 'paid'
        and provider_payment_id is not null and webhook_received_at is not null and paid_at is not null
        and amount = o.total_amount and currency = o.currency
      order by paid_at desc limit 1;
    end if;
    if o.status <> 'paid' or pay.id is null then
      raise exception using message = 'payment_not_confirmed', errcode = 'P0001';
    end if;
  end if;

  if is_ship_transition and (
    coalesce(length(btrim(p_request->>'carrier')), 0) not between 1 and 120
    or btrim(p_request->>'carrier') !~ '^[A-Za-z0-9][A-Za-z0-9 .&()+/_-]*$'
    or coalesce(length(btrim(p_request->>'trackingNumber')), 0) not between 3 and 160
    or btrim(p_request->>'trackingNumber') !~ '^[A-Za-z0-9][A-Za-z0-9 ._/-]*$'
  ) then
    raise exception using message = 'tracking_required', errcode = 'P0001';
  end if;

  if is_shipping_retry and (
    coalesce(length(btrim(o.carrier)), 0) not between 1 and 120
    or btrim(o.carrier) !~ '^[A-Za-z0-9][A-Za-z0-9 .&()+/_-]*$'
    or coalesce(length(btrim(o.tracking_number)), 0) not between 3 and 160
    or btrim(o.tracking_number) !~ '^[A-Za-z0-9][A-Za-z0-9 ._/-]*$'
  ) then
    raise exception using message = 'invalid_shipping_details', errcode = 'P0001';
  end if;

  if p_action = 'shipping.retry' then
    select * into a from public.operational_email_attempts
    where template = 'shipping_confirmation' and entity_type = 'order' and entity_id = o.id::text
    order by created_at desc limit 1 for update;
    if a.delivery_status = 'pending' and (
      a.reconciliation_required
      or a.dispatch_started_at <= now() - interval '23 hours'
    ) then
      raise exception using message = 'reconciliation_required', errcode = 'P0001';
    end if;
  end if;
end $$;

revoke all on function public.admin_shipping_confirmation_guard(uuid,text,jsonb,boolean)
  from public, anon, authenticated, service_role;

create or replace function public.admin_a32_preview_action(
  p_actor uuid, p_action text, p_request jsonb
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  result jsonb;
  r public.drop_interest_requests;
  o public.orders;
  invitation_count bigint;
  latest public.operational_email_attempts;
begin
  perform public.admin_shipping_confirmation_guard(p_actor, p_action, p_request, false);
  if p_action like 'invitation.%' and not exists (
    select 1 from public.admin_roles where user_id = p_actor and role = 'manager' and revoked_at is null
  ) then raise exception using message = 'insufficient_role', errcode = 'P0001'; end if;
  if p_action = 'shipping.reconciliation.preview' then
    select * into o from public.orders where id = (p_request->>'orderId')::uuid;
    select * into latest from public.operational_email_attempts
    where template = 'shipping_confirmation' and entity_type = 'order' and entity_id = o.id::text
    order by created_at desc limit 1;
    if latest.delivery_status is distinct from 'pending' or not (
      latest.reconciliation_required
      or latest.dispatch_started_at <= now() - interval '23 hours'
    ) then
      raise exception using message = 'invalid_transition', errcode = 'P0001';
    end if;
    return jsonb_build_object('success', true, 'preview', jsonb_build_object(
      'orderId', o.id,
      'dropTitle', o.drop_title,
      'fulfilmentStatus', o.fulfilment_status,
      'fulfilmentVersion', o.fulfilment_version,
      'previousDeliveryStatus', latest.delivery_status,
      'reconciliationRequired', true,
      'providerOutcome', 'uncertain',
      'reconciliationOutcome', p_request->>'reconciliationOutcome',
      'evidenceNote', p_request->>'evidenceNote',
      'actionAllowed', true,
      'suggestedAction', 'shipping.reconciliation.resolve'
    ));
  end if;
  if p_action = 'shipping.preview' then
    select * into o from public.orders where id = (p_request->>'orderId')::uuid;
    select * into latest from public.operational_email_attempts
    where template = 'shipping_confirmation' and entity_type = 'order' and entity_id = o.id::text
    order by created_at desc limit 1;
    if latest.delivery_status = 'pending' and (
      latest.reconciliation_required
      or latest.dispatch_started_at <= now() - interval '23 hours'
    ) then
      return jsonb_build_object(
        'success', true,
        'deliveryStatus', 'pending',
        'reconciliationRequired', true,
        'providerOutcome', 'uncertain',
        'automaticRetryBlocked', true,
        'preview', jsonb_build_object(
          'orderId', o.id,
          'fulfilmentStatus', o.fulfilment_status,
          'fulfilmentVersion', o.fulfilment_version,
          'previousDeliveryStatus', latest.delivery_status,
          'reconciliationRequired', true,
          'actionAllowed', false
        )
      );
    end if;
  end if;
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
      'maskedRecipient', case when position('@' in r.email) > 1
        then left(r.email, 1) || '***@' || split_part(r.email, '@', 2) else '***' end,
      'previousDeliveryStatus', latest.delivery_status,
      'previousDeliveryCompletedAt', latest.completed_at
    ));
  end if;
  return result;
end $$;

create or replace function public.admin_a32_apply_action(
  p_actor uuid, p_action text, p_idempotency_key text, p_request_hash text,
  p_request jsonb, p_context jsonb, p_confirmation_hash text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  r public.drop_interest_requests;
  o public.orders;
  a public.operational_email_attempts;
  prior public.admin_operation_idempotency;
  invitation_count bigint;
  reconciled_status text;
  reconciliation_action text;
  v_result jsonb;
  now_at timestamptz := now();
begin
  if p_confirmation_hash is distinct from p_request_hash or p_request_hash !~ '^[a-f0-9]{64}$' then
    raise exception using message = 'confirmation_required', errcode = 'P0001';
  end if;
  perform public.admin_shipping_confirmation_guard(p_actor, p_action, p_request, true);
  if p_action = 'shipping.reconciliation.resolve' then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(p_actor::text || ':' || p_action || ':' || p_idempotency_key, 0)
    );
    select * into prior from public.admin_operation_idempotency
    where actor_user_id = p_actor and action = p_action and idempotency_key = p_idempotency_key
    for update;
    if found then
      if prior.request_hash <> p_request_hash then
        raise exception using message = 'idempotency_conflict', errcode = 'P0001';
      end if;
      if prior.result is null then
        raise exception using message = 'operation_in_progress', errcode = 'P0001';
      end if;
      return prior.result || jsonb_build_object('replay', true);
    end if;
    insert into public.admin_operation_idempotency(
      actor_user_id, action, idempotency_key, request_hash
    ) values (p_actor, p_action, p_idempotency_key, p_request_hash);

    select * into o from public.orders
    where id = (p_request->>'orderId')::uuid for update;
    select * into a from public.operational_email_attempts
    where template = 'shipping_confirmation' and entity_type = 'order' and entity_id = o.id::text
    order by created_at desc limit 1 for update;
    if a.delivery_status is distinct from 'pending' or not (
      a.reconciliation_required
      or a.dispatch_started_at <= now_at - interval '23 hours'
    ) then
      raise exception using message = 'invalid_transition', errcode = 'P0001';
    end if;

    reconciled_status := case p_request->>'reconciliationOutcome'
      when 'provider_acceptance_confirmed' then 'sent'
      when 'provider_non_acceptance_confirmed' then 'failed'
      else null
    end;
    reconciliation_action := 'shipping_confirmation.reconciliation.'
      || (p_request->>'reconciliationOutcome');

    update public.operational_email_attempts set
      delivery_status = reconciled_status,
      reconciliation_required = false,
      provider_id = case when reconciled_status = 'sent' then provider_id else null end,
      dispatch_claim_id = null,
      dispatch_lease_expires_at = null,
      completed_at = now_at
    where id = a.id;
    update public.orders set
      shipping_email_status = reconciled_status,
      updated_at = now_at
    where id = o.id;

    insert into public.email_delivery_events(
      actor_user_id, attempt_id, entity_type, entity_id, template, template_version,
      delivery_status, provider_id, correlation_id, details
    ) values (
      p_actor, a.id, a.entity_type, a.entity_id, a.template, a.template_version,
      reconciled_status, case when reconciled_status = 'sent' then a.provider_id else null end,
      a.id, jsonb_build_object(
        'truthful_outcome', true,
        'manual_reconciliation', true,
        'provider_acceptance_confirmed', reconciled_status = 'sent',
        'inbox_delivery_confirmed', false,
        'evidence_note', p_request->>'evidenceNote'
      )
    );
    insert into public.admin_audit_events(
      actor_user_id, action, entity_type, entity_id, correlation_id, idempotency_key, details
    ) values (
      p_actor, reconciliation_action, 'order', o.id::text, a.id, p_idempotency_key,
      jsonb_build_object(
        'delivery_status', reconciled_status,
        'manual_reconciliation', true,
        'provider_acceptance_confirmed', reconciled_status = 'sent',
        'inbox_delivery_confirmed', false,
        'evidence_note', p_request->>'evidenceNote'
      )
    );
    insert into public.entity_events(
      actor_user_id, source, event_type, entity_type, entity_id,
      correlation_id, idempotency_key, payload
    ) values (
      p_actor, 'admin', reconciliation_action, 'order', o.id::text,
      a.id, p_idempotency_key, jsonb_build_object(
        'delivery_status', reconciled_status,
        'manual_reconciliation', true,
        'provider_acceptance_confirmed', reconciled_status = 'sent',
        'inbox_delivery_confirmed', false,
        'evidence_note', p_request->>'evidenceNote'
      )
    );

    v_result := jsonb_build_object(
      'success', true,
      'entityId', o.id,
      'fulfilmentStatus', o.fulfilment_status,
      'fulfilmentVersion', o.fulfilment_version,
      'emailAttemptId', a.id,
      'deliveryStatus', reconciled_status,
      'reconciliationRequired', false,
      'reconciliationOutcome', p_request->>'reconciliationOutcome',
      'providerAcceptanceConfirmed', reconciled_status = 'sent',
      'inboxDeliveryConfirmed', false
    );
    update public.admin_operation_idempotency set
      result = v_result,
      completed_at = now_at
    where actor_user_id = p_actor and action = p_action and idempotency_key = p_idempotency_key;
    return v_result || jsonb_build_object('replay', false);
  end if;
  if p_action like 'invitation.%' then
    if not exists (
      select 1 from public.admin_roles where user_id = p_actor and role = 'manager' and revoked_at is null
    ) then raise exception using message = 'insufficient_role', errcode = 'P0001'; end if;
    select * into r from public.drop_interest_requests
      where id = (p_request->>'reservationId')::uuid for update;
    if not found then raise exception using message = 'not_found', errcode = 'P0001'; end if;
    select count(*) into invitation_count from public.order_invitations where interest_request_id = r.id;
    if invitation_count > 1 then raise exception using message = 'ambiguous_invitations', errcode = 'P0001'; end if;
    if invitation_count = 1 and exists (
      select 1 from public.order_invitations i where i.interest_request_id = r.id
      and coalesce(i.email_normalized, lower(i.email)) <> coalesce(r.email_normalized, lower(r.email))
    ) then raise exception using message = 'recipient_mismatch', errcode = 'P0001'; end if;
  end if;
  return public.admin_a3_apply_action(
    p_actor, p_action, p_idempotency_key, p_request_hash, p_request, p_context
  );
end $$;

create or replace function public.admin_a32_claim_delivery(
  p_actor uuid, p_attempt_id uuid, p_claim_id uuid
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare a public.operational_email_attempts;
begin
  select * into a from public.operational_email_attempts where id = p_attempt_id;
  if not found then raise exception using message = 'not_found', errcode = 'P0001'; end if;
  if a.template in ('order_invitation', 'shipping_confirmation') and not exists (
    select 1 from public.admin_roles where user_id = p_actor and role = 'manager' and revoked_at is null
  ) then raise exception using message = 'insufficient_role', errcode = 'P0001'; end if;
  if a.template = 'shipping_confirmation' and a.delivery_status = 'pending' and (
    a.reconciliation_required
    or (
      a.dispatch_started_at is not null
      and a.dispatch_started_at <= now() - interval '23 hours'
    )
  ) then
    select * into a from public.operational_email_attempts where id = p_attempt_id for update;
    if a.delivery_status <> 'pending' then
      return jsonb_build_object('claimed', false, 'deliveryStatus', a.delivery_status);
    end if;
    if not (
      a.reconciliation_required
      or (
        a.dispatch_started_at is not null
        and a.dispatch_started_at <= now() - interval '23 hours'
      )
    ) then
      return public.admin_a3_claim_delivery(p_actor, p_attempt_id, p_claim_id);
    end if;
    update public.operational_email_attempts set
      reconciliation_required = true,
      dispatch_claim_id = null,
      dispatch_lease_expires_at = null
    where id = a.id and delivery_status = 'pending';
    update public.admin_operation_idempotency set
      result = coalesce(result, '{}'::jsonb) || jsonb_build_object(
        'deliveryStatus', 'pending',
        'reconciliationRequired', true,
        'providerOutcome', 'uncertain',
        'automaticRetryBlocked', true
      ),
      completed_at = now()
    where result->>'emailAttemptId' = a.id::text;
    return jsonb_build_object(
      'claimed', false,
      'deliveryStatus', 'pending',
      'reconciliationRequired', true,
      'providerOutcome', 'uncertain',
      'automaticRetryBlocked', true
    );
  end if;
  if a.delivery_status = 'pending' and a.dispatch_started_at is not null
     and a.dispatch_started_at <= now() - interval '23 hours' then
    return jsonb_build_object(
      'claimed', false, 'deliveryStatus', 'pending', 'reconciliationRequired', true
    );
  end if;
  return public.admin_a3_claim_delivery(p_actor, p_attempt_id, p_claim_id);
end $$;

create or replace function public.admin_a32_delivery_payload(
  p_actor uuid, p_attempt_id uuid, p_claim_id uuid
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  a public.operational_email_attempts;
  o public.orders;
begin
  select * into a from public.operational_email_attempts where id = p_attempt_id;
  if not found then raise exception using message = 'not_found', errcode = 'P0001'; end if;
  if a.template in ('order_invitation', 'shipping_confirmation') and not exists (
    select 1 from public.admin_roles where user_id = p_actor and role = 'manager' and revoked_at is null
  ) then raise exception using message = 'insufficient_role', errcode = 'P0001'; end if;
  if a.template = 'shipping_confirmation' then
    select * into o from public.orders where id = a.entity_id::uuid for update;
    select * into a from public.operational_email_attempts where id = p_attempt_id for update;
    if a.reconciliation_required then
      raise exception using message = 'reconciliation_required', errcode = 'P0001';
    end if;
    if (
      coalesce(length(btrim(o.carrier)), 0) not between 1 and 120
      or btrim(o.carrier) !~ '^[A-Za-z0-9][A-Za-z0-9 .&()+/_-]*$'
      or coalesce(length(btrim(o.tracking_number)), 0) not between 3 and 160
      or btrim(o.tracking_number) !~ '^[A-Za-z0-9][A-Za-z0-9 ._/-]*$'
    ) then
      raise exception using message = 'invalid_shipping_details', errcode = 'P0001';
    end if;
  end if;
  return public.admin_a3_delivery_payload(p_actor, p_attempt_id, p_claim_id);
end $$;

create or replace function public.admin_a32_complete_delivery(
  p_actor uuid, p_action text, p_idempotency_key text, p_request_hash text,
  p_attempt_id uuid, p_claim_id uuid, p_delivery_status text, p_provider_id text default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  a public.operational_email_attempts;
  prior public.admin_operation_idempotency;
  v_result jsonb;
begin
  select * into a from public.operational_email_attempts where id = p_attempt_id;
  if not found then
    raise exception using message = 'email_attempt_not_found', errcode = 'P0002';
  end if;
  if a.template in ('order_invitation', 'shipping_confirmation') and not exists (
    select 1 from public.admin_roles where user_id = p_actor and role = 'manager' and revoked_at is null
  ) then raise exception using message = 'insufficient_role', errcode = 'P0001'; end if;
  if p_delivery_status = 'pending' then
    if a.template <> 'shipping_confirmation' then
      raise exception using message = 'delivery_attempt_mismatch', errcode = 'P0001';
    end if;
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(p_actor::text || ':' || p_action || ':' || p_idempotency_key, 0)
    );
    select * into prior from public.admin_operation_idempotency
    where actor_user_id = p_actor and action = p_action and idempotency_key = p_idempotency_key
    for update;
    if not found or prior.request_hash <> p_request_hash then
      raise exception using message = 'idempotency_conflict', errcode = 'P0001';
    end if;
    if prior.result->>'emailAttemptId' is distinct from p_attempt_id::text then
      raise exception using message = 'delivery_attempt_mismatch', errcode = 'P0001';
    end if;
    select * into a from public.operational_email_attempts where id = p_attempt_id for update;
    if a.delivery_status <> 'pending' or a.dispatch_claim_id is distinct from p_claim_id then
      raise exception using message = 'delivery_attempt_mismatch', errcode = 'P0001';
    end if;
    update public.operational_email_attempts set
      reconciliation_required = true,
      dispatch_claim_id = null,
      dispatch_lease_expires_at = null
    where id = a.id;
    update public.admin_operation_idempotency set
      result = coalesce(result, '{}'::jsonb) || jsonb_build_object(
        'deliveryStatus', 'pending',
        'reconciliationRequired', true,
        'providerOutcome', 'uncertain',
        'automaticRetryBlocked', true
      ),
      completed_at = now()
    where result->>'emailAttemptId' = a.id::text;
    select result into v_result from public.admin_operation_idempotency
    where actor_user_id = p_actor and action = p_action and idempotency_key = p_idempotency_key;
    return v_result;
  end if;
  if p_delivery_status = 'sent' and (
    p_provider_id is null or length(p_provider_id) > 200
    or p_provider_id !~ '^[A-Za-z0-9_-]+$'
  ) then raise exception using message = 'invalid_provider_id', errcode = 'P0001'; end if;
  return public.admin_a3_complete_delivery(
    p_actor, p_action, p_idempotency_key, p_request_hash,
    p_attempt_id, p_claim_id, p_delivery_status, p_provider_id
  );
end $$;

revoke all on function public.admin_a32_preview_action(uuid,text,jsonb)
  from public, anon, authenticated;
revoke all on function public.admin_a32_apply_action(uuid,text,text,text,jsonb,jsonb,text)
  from public, anon, authenticated;
revoke all on function public.admin_a32_claim_delivery(uuid,uuid,uuid)
  from public, anon, authenticated;
revoke all on function public.admin_a32_delivery_payload(uuid,uuid,uuid)
  from public, anon, authenticated;
revoke all on function public.admin_a32_complete_delivery(uuid,text,text,text,uuid,uuid,text,text)
  from public, anon, authenticated;
grant execute on function public.admin_a32_preview_action(uuid,text,jsonb) to service_role;
grant execute on function public.admin_a32_apply_action(uuid,text,text,text,jsonb,jsonb,text) to service_role;
grant execute on function public.admin_a32_claim_delivery(uuid,uuid,uuid) to service_role;
grant execute on function public.admin_a32_delivery_payload(uuid,uuid,uuid) to service_role;
grant execute on function public.admin_a32_complete_delivery(uuid,text,text,text,uuid,uuid,text,text)
  to service_role;

-- Rollback only after the shipping action route is disabled: restore the prior
-- A3.2 wrapper definitions in a new forward migration. Do not edit applied history.
