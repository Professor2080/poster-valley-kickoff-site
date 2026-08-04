\set ON_ERROR_STOP on

begin;

insert into auth.users(id) values
  ('91000000-0000-4000-8000-000000000001'),
  ('91000000-0000-4000-8000-000000000002');
insert into public.admin_roles(user_id, role) values
  ('91000000-0000-4000-8000-000000000001', 'manager'),
  ('91000000-0000-4000-8000-000000000002', 'operator');

do $contract$
begin
  if (select production_threshold from public.product_registry where product_code = 'eurofighter-typhoon-a2') <> 5 then
    raise exception 'Eurofighter A2 production threshold must be five';
  end if;
  if (select attnotnull from pg_catalog.pg_attribute where attrelid = 'public.product_registry'::regclass and attname = 'production_threshold') then
    raise exception 'production threshold must remain nullable for historical compatibility';
  end if;
end
$contract$;

insert into public.product_registry(product_code, drop_slug, title, lifecycle_mode)
values ('threshold-default-contract', 'threshold-default-contract', 'Threshold default contract', 'interest');
insert into public.product_registry(product_code, drop_slug, title, lifecycle_mode, production_threshold)
values ('threshold-null-contract', 'threshold-null-contract', 'Threshold null contract', 'interest', null);
insert into public.product_registry(product_code, drop_slug, title, lifecycle_mode, production_threshold)
values ('threshold-override-contract', 'threshold-override-contract', 'Threshold override contract', 'interest', 7);

insert into public.drop_interest_requests(
  id, drop_slug, drop_title, full_name, email, email_normalized, country, country_code,
  preferred_format, quantity, record_origin
) values (
  '92000000-0000-4000-8000-000000000002', 'threshold-override-contract', 'Threshold override contract',
  'Threshold Contract', 'threshold-contract@example.test', 'threshold-contract@example.test',
  'Netherlands', 'NL', 'A2', 2, 'customer'
);

insert into public.drop_interest_requests(
  id, drop_slug, drop_title, full_name, email, email_normalized, country, country_code,
  preferred_format, quantity, record_origin
) values (
  '92000000-0000-4000-8000-000000000004', 'threshold-null-contract', 'Threshold null contract',
  'Missing Threshold', 'missing-threshold@example.test', 'missing-threshold@example.test',
  'Netherlands', 'NL', 'A2', 1, 'customer'
);

do $contract$
begin
  if (select production_threshold from public.product_registry where product_code = 'threshold-default-contract') <> 5 then
    raise exception 'omitted production threshold must default to five';
  end if;
  if (select production_threshold from public.product_registry where product_code = 'threshold-null-contract') <> 5 then
    raise exception 'explicit null production threshold must normalize to five on insert';
  end if;
  if (select production_threshold from public.product_registry where product_code = 'threshold-override-contract') <> 7 then
    raise exception 'explicit production threshold override must be preserved';
  end if;
  if not exists (
    select 1 from public.admin_order_flow_drop_v1
    where product_code = 'threshold-override-contract'
      and production_threshold = 7
      and qualified_units = 2
      and units_needed = 5
      and threshold_reached is false
  ) then
    raise exception 'board progress must use the stored production threshold';
  end if;
end
$contract$;

-- Historical rows may still have no configured threshold. The insert trigger
-- deliberately normalizes new rows only; an explicit later configuration can
-- remain null for compatibility and must not block invitation preview/send.
update public.product_registry
set production_threshold = null
where product_code = 'threshold-null-contract';

update public.product_registry
set lifecycle_mode = 'interest', invitations_opened_at = null,
    invitations_opened_by = null, updated_at = '2026-08-02T12:00:00Z'
where product_code = 'eurofighter-typhoon-a2';

insert into public.drop_interest_requests(
  id, drop_slug, drop_title, full_name, email, email_normalized, country, country_code,
  preferred_format, quantity, record_origin
) values (
  '92000000-0000-4000-8000-000000000001', 'eurofighter-typhoon', 'Eurofighter Typhoon',
  'Board Contract', 'board-contract@example.test', 'board-contract@example.test',
  'Netherlands', 'NL', 'A2', 5, 'customer'
);

insert into public.drop_interest_requests(
  id, drop_slug, drop_title, full_name, email, email_normalized, country, country_code,
  preferred_format, quantity, record_origin, record_origin_needs_review
) values (
  '92000000-0000-4000-8000-000000000003', 'eurofighter-typhoon', 'Eurofighter Typhoon',
  'Successful Invite', 'successful-invite@example.test', 'successful-invite@example.test',
  'Netherlands', 'NL', 'A2', 1, 'test', false
);

do $contract$
declare
  v_result jsonb;
  v_updated_at timestamptz;
  v_attempt_id uuid;
  v_claim_id uuid;
  v_attention jsonb;
  v_source_id uuid;
  v_index integer := 0;
begin
  if (select stage from public.admin_order_flow_v1 where source_id = '92000000-0000-4000-8000-000000000001') <> 'new' then
    raise exception 'fresh interest must remain new until Process';
  end if;

  foreach v_source_id in array array[
    '92000000-0000-4000-8000-000000000001'::uuid,
    '92000000-0000-4000-8000-000000000002'::uuid,
    '92000000-0000-4000-8000-000000000003'::uuid,
    '92000000-0000-4000-8000-000000000004'::uuid
  ] loop
    v_index := v_index + 1;
    v_result := public.admin_order_flow_preview_action(
      '91000000-0000-4000-8000-000000000001', 'board.process.preview',
      jsonb_build_object('sourceType', 'drop', 'sourceId', v_source_id, 'expectedVersion', 0)
    );
    if v_result #>> '{preview,nextStage}' <> 'interest' then raise exception 'server-owned Process destination mismatch'; end if;
    v_result := public.admin_order_flow_apply_action(
      '91000000-0000-4000-8000-000000000001', 'board.process', 'board-contract-process-' || v_index,
      repeat('a', 64), jsonb_build_object('sourceType', 'drop', 'sourceId', v_source_id, 'expectedVersion', 0), repeat('a', 64)
    );
    if v_result->>'boardStage' <> 'interest' or v_result->>'replay' <> 'false' then raise exception 'Process apply mismatch'; end if;
  end loop;

  if (select stage from public.admin_order_flow_v1 where source_id = '92000000-0000-4000-8000-000000000001') <> 'interest' then
    raise exception 'processed interest must enter Interest';
  end if;
  if (select reservation_status from public.drop_interest_requests where id = '92000000-0000-4000-8000-000000000001') <> 'new' then
    raise exception 'Process must not mutate reservation lifecycle truth';
  end if;
  if not exists (
    select 1 from public.admin_order_flow_drop_v1
    where product_code = 'eurofighter-typhoon-a2'
      and production_threshold = 5
      and qualified_units = 5
      and units_needed = 0
      and threshold_reached is true
  ) then
    raise exception 'Eurofighter board progress must use its stored threshold of five';
  end if;

  -- Manager authorization is preserved for invitations even though threshold
  -- state no longer gates their availability.
  begin
    perform public.admin_a32_preview_action(
      '91000000-0000-4000-8000-000000000002', 'invitation.preview',
      jsonb_build_object('reservationId', '92000000-0000-4000-8000-000000000002')
    );
    raise exception 'operator unexpectedly previewed an invitation';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'insufficient_role' then raise; end if;
  end;

  -- A valid under-threshold Interest item can be previewed and sent. The
  -- existing confirmation proof, idempotency and delivery pipeline remain the
  -- authority; a failed provider outcome must not advance the card.
  v_result := public.admin_a32_preview_action(
    '91000000-0000-4000-8000-000000000001', 'invitation.preview',
    jsonb_build_object('reservationId', '92000000-0000-4000-8000-000000000002')
  );
  if v_result #>> '{preview,suggestedAction}' <> 'invitation.send'
     or (v_result #>> '{preview,productionThreshold}')::integer <> 7
     or (v_result #>> '{preview,qualifiedUnits}')::integer <> 2
     or (v_result #>> '{preview,thresholdReached}')::boolean then
    raise exception 'under-threshold invitation preview mismatch';
  end if;
  v_result := public.admin_a32_apply_action(
    '91000000-0000-4000-8000-000000000001', 'invitation.send', 'board-contract-invite-failed',
    repeat('b', 64), jsonb_build_object('reservationId', '92000000-0000-4000-8000-000000000002'),
    jsonb_build_object('tokenHash', repeat('1', 64), 'expiresAt', now() + interval '7 days',
      'dropId', 'drop_threshold_contract', 'dropTitle', 'Threshold override contract',
      'unitPrice', 17.75, 'currency', 'EUR'), repeat('b', 64)
  );
  v_attempt_id := (v_result->>'emailAttemptId')::uuid;
  v_claim_id := '96000000-0000-4000-8000-000000000001';
  perform public.admin_a32_claim_delivery('91000000-0000-4000-8000-000000000001', v_attempt_id, v_claim_id);
  perform public.admin_a32_complete_delivery(
    '91000000-0000-4000-8000-000000000001', 'invitation.send', 'board-contract-invite-failed',
    repeat('b', 64), v_attempt_id, v_claim_id, 'failed', null
  );
  if not exists (
    select 1 from public.admin_order_flow_v1
    where source_id = '92000000-0000-4000-8000-000000000002'
      and stage = 'interest' and needs_attention is true and invitation_delivery_status = 'failed'
  ) then raise exception 'failed invitation must remain in Interest with Attention'; end if;

  -- A reached-threshold Interest item uses the same pipeline. Only an accepted
  -- provider send advances that one card and removes its derived Attention.
  v_result := public.admin_a32_preview_action(
    '91000000-0000-4000-8000-000000000001', 'invitation.preview',
    jsonb_build_object('reservationId', '92000000-0000-4000-8000-000000000003')
  );
  if v_result #>> '{preview,suggestedAction}' <> 'invitation.send'
     or (v_result #>> '{preview,productionThreshold}')::integer <> 5
     or (v_result #>> '{preview,thresholdReached}')::boolean is not true then
    raise exception 'reached-threshold invitation preview mismatch';
  end if;
  v_result := public.admin_a32_apply_action(
    '91000000-0000-4000-8000-000000000001', 'invitation.send', 'board-contract-invite-sent',
    repeat('c', 64), jsonb_build_object('reservationId', '92000000-0000-4000-8000-000000000003'),
    jsonb_build_object('tokenHash', repeat('2', 64), 'expiresAt', now() + interval '7 days',
      'dropId', 'drop_eurofighter_typhoon', 'dropTitle', 'Eurofighter Typhoon',
      'unitPrice', 17.75, 'currency', 'EUR'), repeat('c', 64)
  );
  v_attempt_id := (v_result->>'emailAttemptId')::uuid;
  v_claim_id := '96000000-0000-4000-8000-000000000002';
  perform public.admin_a32_claim_delivery('91000000-0000-4000-8000-000000000001', v_attempt_id, v_claim_id);
  perform public.admin_a32_complete_delivery(
    '91000000-0000-4000-8000-000000000001', 'invitation.send', 'board-contract-invite-sent',
    repeat('c', 64), v_attempt_id, v_claim_id, 'sent', 'provider_contract_invite'
  );
  if (select stage from public.admin_order_flow_v1
      where source_id = '92000000-0000-4000-8000-000000000003') <> 'awaiting_payment' then
    raise exception 'successful invitation must move its card to Awaiting payment';
  end if;
  if (select needs_attention from public.admin_order_flow_v1
      where source_id = '92000000-0000-4000-8000-000000000003') is not false then
    raise exception 'successful invitation must clear derived Attention: %', (
      select jsonb_build_object(
        'stage', stage, 'originReview', record_origin_needs_review,
        'invitationCount', invitation_count, 'invitationStatus', invitation_status,
        'deliveryStatus', invitation_delivery_status, 'paymentStatus', payment_status,
        'shippingStatus', shipping_email_status, 'reconciliation', shipping_reconciliation_required,
        'thresholdReached', threshold_reached
      ) from public.admin_order_flow_v1
      where source_id = '92000000-0000-4000-8000-000000000003'
    );
  end if;
  if (select invitation_sent_at from public.admin_order_flow_v1
      where source_id = '92000000-0000-4000-8000-000000000003') is null then
    raise exception 'successful invitation must retain provider-accepted sent evidence';
  end if;
  if (select count(*) from public.admin_order_flow_v1 where stage = 'awaiting_payment') <> 1 then
    raise exception 'successful invitation must move exactly one card';
  end if;

  -- The current-state Attention filter includes reached unsent and failed
  -- Interest rows, but excludes the successfully sent row.
  v_attention := public.admin_order_flow_read(
    '91000000-0000-4000-8000-000000000001', null, null, null, 'interest', true, false, 100, 0
  );
  if not exists (
    select 1 from jsonb_array_elements(v_attention->'items') item
    where item->>'source_id' = '92000000-0000-4000-8000-000000000001'
  ) then raise exception 'reached unsent Interest card missing from Attention filter'; end if;
  if not exists (
    select 1 from jsonb_array_elements(v_attention->'items') item
    where item->>'source_id' = '92000000-0000-4000-8000-000000000002'
  ) then raise exception 'failed Interest card missing from Attention filter'; end if;
  if exists (
    select 1 from jsonb_array_elements(v_attention->'items') item
    where item->>'source_id' = '92000000-0000-4000-8000-000000000003'
  ) then raise exception 'sent card retained stale Attention'; end if;

  -- A historical missing threshold remains visible but never blocks Send invite.
  v_result := public.admin_a32_preview_action(
    '91000000-0000-4000-8000-000000000001', 'invitation.preview',
    jsonb_build_object('reservationId', '92000000-0000-4000-8000-000000000004')
  );
  if v_result #>> '{preview,suggestedAction}' <> 'invitation.send'
     or v_result #> '{preview,productionThreshold}' <> 'null'::jsonb then
    raise exception 'missing threshold must not block invitation preview';
  end if;

  -- Threshold administration retains manager authorization, versioning,
  -- confirmation, idempotency and audit guarantees.
  select updated_at into v_updated_at from public.product_registry where product_code = 'threshold-override-contract';
  begin
    perform public.admin_order_flow_set_threshold(
      '91000000-0000-4000-8000-000000000002', 'drop.threshold.set', 'threshold-operator-denied',
      repeat('d', 64), jsonb_build_object('productCode', 'threshold-override-contract',
        'productionThreshold', 9, 'expectedUpdatedAt', v_updated_at), repeat('d', 64)
    );
    raise exception 'operator unexpectedly changed threshold';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'insufficient_role' then raise; end if;
  end;
  perform public.admin_order_flow_preview_action(
    '91000000-0000-4000-8000-000000000001', 'drop.threshold.preview',
    jsonb_build_object('productCode', 'threshold-override-contract',
      'productionThreshold', 9, 'expectedUpdatedAt', v_updated_at)
  );
  v_result := public.admin_order_flow_set_threshold(
    '91000000-0000-4000-8000-000000000001', 'drop.threshold.set', 'threshold-manager-change',
    repeat('e', 64), jsonb_build_object('productCode', 'threshold-override-contract',
      'productionThreshold', 9, 'expectedUpdatedAt', v_updated_at), repeat('e', 64)
  );
  if v_result->>'replay' <> 'false' or v_result->>'productionThreshold' <> '9' then
    raise exception 'threshold mutation mismatch';
  end if;
  v_result := public.admin_order_flow_set_threshold(
    '91000000-0000-4000-8000-000000000001', 'drop.threshold.set', 'threshold-manager-change',
    repeat('e', 64), jsonb_build_object('productCode', 'threshold-override-contract',
      'productionThreshold', 9, 'expectedUpdatedAt', v_updated_at), repeat('e', 64)
  );
  if v_result->>'replay' <> 'true' then raise exception 'threshold idempotency replay mismatch'; end if;
  if (select production_threshold from public.product_registry where product_code = 'threshold-override-contract') <> 9
     or (select count(*) from public.admin_audit_events where action = 'drop.production_threshold_changed'
       and entity_id = 'threshold-override-contract') <> 1 then
    raise exception 'threshold change must be stored and audited exactly once';
  end if;
end
$contract$;

insert into public.order_invitations(
  id, interest_request_id, drop_id, drop_slug, drop_title, email, email_normalized,
  first_name, last_name, quantity, currency, unit_price, subtotal_amount, status, token_hash, expires_at
) values (
  '93000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000001',
  'drop_eurofighter_typhoon', 'eurofighter-typhoon', 'Eurofighter Typhoon',
  'board-contract@example.test', 'board-contract@example.test', 'Board', 'Contract', 1,
  'EUR', 17.75, 17.75, 'sent', repeat('c', 64), now() + interval '7 days'
);
insert into public.orders(
  id, invitation_id, interest_request_id, drop_id, drop_slug, drop_title, status, email,
  first_name, last_name, quantity, currency, unit_price, subtotal_amount, shipping_amount,
  total_amount, shipping_profile_id, shipping_country, shipping_country_code, shipping_name,
  address_line1, postal_code, city, accepted_terms_at, payment_request_hash,
  payment_start_status, payment_provider_started_at
) values (
  '94000000-0000-4000-8000-000000000001', '93000000-0000-4000-8000-000000000001',
  '92000000-0000-4000-8000-000000000001', 'drop_eurofighter_typhoon',
  'eurofighter-typhoon', 'Eurofighter Typhoon', 'paid', 'board-contract@example.test',
  'Board', 'Contract', 1, 'EUR', 17.75, 17.75, 5.95, 23.70, 'protected-a2',
  'Netherlands', 'NL', 'Board Contract', '1 Contract Street', '1015 CJ', 'Amsterdam',
  now(), repeat('d', 64), 'provider_created', now()
);
insert into public.payments(
  id, order_id, provider, provider_payment_id, status, amount, currency, webhook_received_at, paid_at
) values (
  '95000000-0000-4000-8000-000000000001', '94000000-0000-4000-8000-000000000001',
  'mollie', 'tr_boardcontract', 'paid', 23.70, 'EUR', now(), now()
);

do $contract$
declare
  v_result jsonb;
begin
  if (select stage from public.admin_order_flow_v1 where source_id = '92000000-0000-4000-8000-000000000001') <> 'paid_to_ship' then
    raise exception 'only webhook-confirmed exact paid evidence may enter Paid to ship';
  end if;
  if (select count(*) from public.entity_events where source = 'provider' and event_type = 'payment.paid' and entity_id = '94000000-0000-4000-8000-000000000001') <> 1 then
    raise exception 'provider-confirmed payment event missing';
  end if;

  update public.orders
  set fulfilment_status = 'shipped', fulfilment_version = 1, carrier = 'Contract Carrier',
      tracking_number = 'TRACK-CONTRACT', shipped_at = now(), shipping_email_status = 'sent', updated_at = now()
  where id = '94000000-0000-4000-8000-000000000001';
  if (select stage from public.admin_order_flow_v1 where source_id = '92000000-0000-4000-8000-000000000001') <> 'shipped' then
    raise exception 'shipped fulfilment must enter Shipped';
  end if;

  perform public.admin_order_flow_preview_action(
    '91000000-0000-4000-8000-000000000001', 'delivery.confirm.preview',
    jsonb_build_object('sourceId', '92000000-0000-4000-8000-000000000001', 'orderId', '94000000-0000-4000-8000-000000000001', 'expectedVersion', 1)
  );
  v_result := public.admin_order_flow_apply_action(
    '91000000-0000-4000-8000-000000000001', 'delivery.confirm', 'board-contract-delivery',
    repeat('e', 64), jsonb_build_object('sourceId', '92000000-0000-4000-8000-000000000001', 'orderId', '94000000-0000-4000-8000-000000000001', 'expectedVersion', 1), repeat('e', 64)
  );
  if v_result->>'boardVersion' <> '2' then raise exception 'delivery confirmation version mismatch'; end if;

  perform public.admin_order_flow_preview_action(
    '91000000-0000-4000-8000-000000000001', 'board.close.preview',
    jsonb_build_object('sourceId', '92000000-0000-4000-8000-000000000001', 'orderId', '94000000-0000-4000-8000-000000000001', 'expectedVersion', 2)
  );
  perform public.admin_order_flow_apply_action(
    '91000000-0000-4000-8000-000000000001', 'board.close', 'board-contract-close',
    repeat('f', 64), jsonb_build_object('sourceId', '92000000-0000-4000-8000-000000000001', 'orderId', '94000000-0000-4000-8000-000000000001', 'expectedVersion', 2), repeat('f', 64)
  );
  if (select stage from public.admin_order_flow_v1 where source_id = '92000000-0000-4000-8000-000000000001') <> 'closed' then
    raise exception 'delivered order must enter Closed archive';
  end if;
end
$contract$;

rollback;
