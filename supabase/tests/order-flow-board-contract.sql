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

do $contract$
declare
  v_result jsonb;
  v_updated_at timestamptz;
begin
  if (select stage from public.admin_order_flow_v1 where source_id = '92000000-0000-4000-8000-000000000001') <> 'new' then
    raise exception 'fresh interest must remain new until Process';
  end if;

  v_result := public.admin_order_flow_preview_action(
    '91000000-0000-4000-8000-000000000001', 'board.process.preview',
    jsonb_build_object('sourceType', 'drop', 'sourceId', '92000000-0000-4000-8000-000000000001', 'expectedVersion', 0)
  );
  if v_result #>> '{preview,nextStage}' <> 'interest' then raise exception 'server-owned Process destination mismatch'; end if;

  v_result := public.admin_order_flow_apply_action(
    '91000000-0000-4000-8000-000000000001', 'board.process', 'board-contract-process',
    repeat('a', 64), jsonb_build_object('sourceType', 'drop', 'sourceId', '92000000-0000-4000-8000-000000000001', 'expectedVersion', 0), repeat('a', 64)
  );
  if v_result->>'boardStage' <> 'interest' or v_result->>'replay' <> 'false' then raise exception 'Process apply mismatch'; end if;
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

  begin
    perform public.admin_order_flow_preview_action(
      '91000000-0000-4000-8000-000000000002', 'drop.open.preview',
      jsonb_build_object('productCode', 'eurofighter-typhoon-a2', 'expectedUpdatedAt', '2026-08-02T12:00:00Z')
    );
    raise exception 'operator unexpectedly opened drop preview';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'insufficient_role' then raise; end if;
  end;

  select updated_at into v_updated_at from public.product_registry where product_code = 'eurofighter-typhoon-a2';
  perform public.admin_order_flow_preview_action(
    '91000000-0000-4000-8000-000000000001', 'drop.open.preview',
    jsonb_build_object('productCode', 'eurofighter-typhoon-a2', 'expectedUpdatedAt', v_updated_at)
  );
  perform public.admin_order_flow_apply_action(
    '91000000-0000-4000-8000-000000000001', 'drop.open', 'board-contract-drop-open',
    repeat('b', 64), jsonb_build_object('productCode', 'eurofighter-typhoon-a2', 'expectedUpdatedAt', v_updated_at), repeat('b', 64)
  );
  if (select stage from public.admin_order_flow_v1 where source_id = '92000000-0000-4000-8000-000000000001') <> 'ready_to_invite' then
    raise exception 'qualified opened drop must enter Ready to invite';
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
