-- Add a small operational work layer for the Admin Order Flow Board.
-- Order, payment, invitation and fulfilment lifecycle truth remains in the existing tables.

begin;
set local search_path = pg_catalog, public, extensions;

alter table public.product_registry
  add column drop_slug text,
  add column production_threshold integer,
  add column invitations_opened_at timestamp with time zone,
  add column invitations_opened_by uuid;

alter table public.product_registry
  add constraint product_registry_drop_slug_check
    check (drop_slug is null or drop_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  add constraint product_registry_production_threshold_check
    check (production_threshold is null or production_threshold between 1 and 100000),
  add constraint product_registry_invitations_opened_by_fkey
    foreign key (invitations_opened_by) references auth.users(id) on delete set null;

create unique index product_registry_drop_slug_key
  on public.product_registry (drop_slug)
  where drop_slug is not null;
create index product_registry_invitations_opened_by_idx
  on public.product_registry (invitations_opened_by)
  where invitations_opened_by is not null;

update public.product_registry
set drop_slug = 'eurofighter-typhoon'
where product_code = 'eurofighter-typhoon-a2'
  and drop_slug is null;

-- Existing invitations prove that the historical drop was already open. Preserve that
-- operational reality without inventing a production threshold for a fresh installation.
update public.product_registry p
set lifecycle_mode = 'preorder',
    invitations_opened_at = coalesce(
      p.invitations_opened_at,
      (select min(i.created_at) from public.order_invitations i where i.drop_slug = p.drop_slug),
      p.updated_at
    ),
    updated_at = greatest(
      p.updated_at,
      coalesce((select min(i.created_at) from public.order_invitations i where i.drop_slug = p.drop_slug), p.updated_at)
    )
where p.drop_slug is not null
  and p.lifecycle_mode = 'interest'
  and exists (select 1 from public.order_invitations i where i.drop_slug = p.drop_slug);

create table public.admin_order_flow_state (
  drop_interest_request_id uuid primary key
    references public.drop_interest_requests(id) on delete restrict,
  processed_at timestamp with time zone,
  processed_by uuid references auth.users(id) on delete set null,
  delivery_confirmed_at timestamp with time zone,
  delivery_confirmed_by uuid references auth.users(id) on delete set null,
  closed_at timestamp with time zone,
  closed_by uuid references auth.users(id) on delete set null,
  closed_order_status text,
  closed_fulfilment_status text,
  version bigint default 0 not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint admin_order_flow_state_version_check check (version >= 0),
  constraint admin_order_flow_state_delivery_check check (
    delivery_confirmed_at is not null or delivery_confirmed_by is null
  ),
  constraint admin_order_flow_state_close_check check (
    (closed_at is null and closed_by is null and closed_order_status is null and closed_fulfilment_status is null)
    or (
      closed_at is not null and delivery_confirmed_at is not null
      and closed_order_status is not null and closed_fulfilment_status is not null
    )
  ),
  constraint admin_order_flow_state_timeline_check check (
    (delivery_confirmed_at is null or closed_at is null or delivery_confirmed_at <= closed_at)
    and created_at <= updated_at
  )
);

create index admin_order_flow_state_processed_by_idx
  on public.admin_order_flow_state (processed_by)
  where processed_by is not null;
create index admin_order_flow_state_delivery_confirmed_by_idx
  on public.admin_order_flow_state (delivery_confirmed_by)
  where delivery_confirmed_by is not null;
create index admin_order_flow_state_closed_by_idx
  on public.admin_order_flow_state (closed_by)
  where closed_by is not null;
create index admin_order_flow_state_open_updated_idx
  on public.admin_order_flow_state (updated_at desc, drop_interest_request_id)
  where closed_at is null;

alter table public.admin_order_flow_state enable row level security;

create view public.admin_order_flow_v1 with (security_invoker = true) as
with roots as (
  select
    r.id as source_id,
    'drop'::text as source_type,
    'PV-' || upper(left(replace(r.id::text, '-', ''), 8)) as reference_number,
    r.created_at,
    coalesce(
      s.processed_at,
      case
        when r.reservation_status <> 'new' or r.status <> 'new' or invitation.id is not null or customer_order.id is not null
          then coalesce(invitation.created_at, customer_order.created_at, r.created_at)
      end
    ) as effective_processed_at,
    s.processed_at,
    s.processed_by,
    s.delivery_confirmed_at,
    s.delivery_confirmed_by,
    s.closed_at,
    s.closed_by,
    s.closed_order_status,
    s.closed_fulfilment_status,
    coalesce(s.version, 0) as board_version,
    r.drop_slug,
    r.drop_title,
    r.preferred_format,
    r.quantity,
    r.country_code,
    coalesce(nullif(btrim(r.full_name), ''), concat_ws(' ', r.first_name, r.last_name)) as customer_name,
    case
      when position('@' in r.email) > 1 then left(r.email, 1) || '***@' || split_part(r.email, '@', 2)
      else '***'
    end as masked_email,
    r.reservation_status,
    r.status as reservation_legacy_status,
    r.record_origin,
    r.record_origin_needs_review,
    product.product_code,
    product.lifecycle_mode as drop_lifecycle_mode,
    product.production_threshold,
    product.invitations_opened_at,
    invitation.id as invitation_id,
    invitation.status as invitation_status,
    invitation.sent_at as invitation_sent_at,
    invitation.expires_at as invitation_expires_at,
    invitation.subtotal_amount,
    invitation.currency,
    invitation.delivery_status as invitation_delivery_status,
    invitation.invitation_count,
    customer_order.id as order_id,
    customer_order.status as order_status,
    customer_order.total_amount,
    customer_order.shipping_amount,
    customer_order.shipping_country_code,
    customer_order.fulfilment_status,
    customer_order.fulfilment_version,
    customer_order.carrier,
    customer_order.tracking_number,
    customer_order.shipped_at,
    customer_order.shipping_email_status,
    customer_order.shipping_reconciliation_required,
    latest_payment.status as payment_status,
    latest_payment.webhook_received_at as payment_webhook_received_at,
    latest_payment.paid_at as payment_paid_at,
    confirmed_payment.id as confirmed_payment_id,
    greatest(
      r.created_at,
      coalesce(invitation.updated_at, r.created_at),
      coalesce(customer_order.updated_at, r.created_at),
      coalesce(latest_payment.updated_at, r.created_at),
      coalesce(s.updated_at, r.created_at)
    ) as last_activity_at
  from public.drop_interest_requests r
  left join public.admin_order_flow_state s on s.drop_interest_request_id = r.id
  left join public.product_registry product on product.drop_slug = r.drop_slug
  left join lateral (
    select
      i.*,
      count(*) over () as invitation_count,
      latest_delivery.delivery_status
    from public.order_invitations i
    left join lateral (
      select a.delivery_status
      from public.operational_email_attempts a
      where a.template = 'order_invitation'
        and a.entity_type = 'order_invitation'
        and a.entity_id = i.id::text
      order by a.created_at desc
      limit 1
    ) latest_delivery on true
    where i.interest_request_id = r.id
    order by i.created_at desc
    limit 1
  ) invitation on true
  left join lateral (
    select o.*,
      coalesce(
        latest_shipping.reconciliation_required
          or (
            latest_shipping.delivery_status = 'pending'
            and latest_shipping.dispatch_started_at <= now() - interval '23 hours'
          ),
        false
      ) as shipping_reconciliation_required
    from public.orders o
    left join lateral (
      select a.delivery_status, a.dispatch_started_at, a.reconciliation_required
      from public.operational_email_attempts a
      where a.template = 'shipping_confirmation'
        and a.entity_type = 'order'
        and a.entity_id = o.id::text
      order by a.created_at desc
      limit 1
    ) latest_shipping on true
    where o.interest_request_id = r.id
    order by o.created_at desc
    limit 1
  ) customer_order on true
  left join lateral (
    select p.*
    from public.payments p
    where p.order_id = customer_order.id
    order by p.created_at desc
    limit 1
  ) latest_payment on true
  left join lateral (
    select p.id
    from public.payments p
    where p.order_id = customer_order.id
      and p.provider = 'mollie'
      and p.status = 'paid'
      and p.provider_payment_id is not null
      and p.webhook_received_at is not null
      and p.paid_at is not null
      and p.amount = customer_order.total_amount
      and p.currency = customer_order.currency
    order by p.paid_at desc
    limit 1
  ) confirmed_payment on true
)
select
  roots.*,
  case
    when closed_at is not null then 'closed'
    when effective_processed_at is null then 'new'
    when confirmed_payment_id is not null and fulfilment_status = 'shipped' then 'shipped'
    when confirmed_payment_id is not null and order_status = 'paid' then 'paid_to_ship'
    when invitation_status in ('sent', 'opened', 'order_started', 'payment_open', 'paid')
      or order_status in ('awaiting_payment', 'payment_open', 'payment_failed', 'payment_expired', 'cancelled', 'paid')
      then 'awaiting_payment'
    when drop_lifecycle_mode = 'preorder' then 'ready_to_invite'
    else 'interest'
  end as stage,
  (
    record_origin_needs_review
    or invitation_count > 1
    or invitation_status = 'expired'
    or invitation_delivery_status in ('failed', 'suppressed')
    or payment_status in ('failed', 'expired', 'canceled', 'unknown')
    or shipping_email_status = 'failed'
    or shipping_reconciliation_required is true
    or (effective_processed_at is not null and drop_lifecycle_mode = 'interest' and production_threshold is null)
  ) as needs_attention,
  case when order_id is not null then 'orders' else 'reservations' end as detail_resource,
  coalesce(order_id, source_id) as detail_id
from roots;

create view public.admin_order_flow_drop_v1 with (security_invoker = true) as
select
  p.product_code,
  p.drop_slug,
  p.title as drop_title,
  p.lifecycle_mode,
  p.production_threshold,
  p.invitations_opened_at,
  p.updated_at,
  coalesce(sum(r.quantity) filter (
    where r.record_origin = 'customer'
      and r.record_origin_needs_review is false
      and r.reservation_status <> 'cancelled'
      and r.status <> 'cancelled'
  ), 0)::bigint as qualified_units,
  case
    when p.production_threshold is null then null
    else greatest(p.production_threshold - coalesce(sum(r.quantity) filter (
      where r.record_origin = 'customer'
        and r.record_origin_needs_review is false
        and r.reservation_status <> 'cancelled'
        and r.status <> 'cancelled'
    ), 0), 0)::bigint
  end as units_needed,
  p.production_threshold is not null and coalesce(sum(r.quantity) filter (
    where r.record_origin = 'customer'
      and r.record_origin_needs_review is false
      and r.reservation_status <> 'cancelled'
      and r.status <> 'cancelled'
  ), 0) >= p.production_threshold as threshold_reached
from public.product_registry p
left join public.drop_interest_requests r on r.drop_slug = p.drop_slug
where p.drop_slug is not null
group by p.product_code, p.drop_slug, p.title, p.lifecycle_mode, p.production_threshold, p.invitations_opened_at, p.updated_at;

create or replace function public.admin_order_flow_read(
  p_actor uuid,
  p_search text default null,
  p_drop_slug text default null,
  p_source_type text default null,
  p_stage text default null,
  p_needs_attention boolean default null,
  p_include_closed boolean default false,
  p_limit integer default 100,
  p_offset integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare result jsonb;
begin
  if not exists (
    select 1 from public.admin_roles
    where user_id = p_actor and revoked_at is null
  ) then raise exception using message = 'forbidden', errcode = 'P0001'; end if;
  if p_search is not null and (length(p_search) > 120 or p_search ~ '[[:cntrl:]]') then
    raise exception using message = 'invalid_filter', errcode = 'P0001';
  end if;
  if p_drop_slug is not null and p_drop_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
    raise exception using message = 'invalid_filter', errcode = 'P0001';
  end if;
  if p_source_type is not null and p_source_type not in ('drop', 'shop_order') then
    raise exception using message = 'invalid_filter', errcode = 'P0001';
  end if;
  if p_stage is not null and p_stage not in ('new', 'interest', 'ready_to_invite', 'awaiting_payment', 'paid_to_ship', 'shipped', 'closed') then
    raise exception using message = 'invalid_filter', errcode = 'P0001';
  end if;
  if p_limit not between 1 and 100 or p_offset not between 0 and 100000 then
    raise exception using message = 'invalid_pagination', errcode = 'P0001';
  end if;

  with filtered as (
    select *
    from public.admin_order_flow_v1 flow
    where (p_include_closed or flow.stage <> 'closed')
      and (p_drop_slug is null or flow.drop_slug = p_drop_slug)
      and (p_source_type is null or flow.source_type = p_source_type)
      and (p_stage is null or flow.stage = p_stage)
      and (p_needs_attention is null or flow.needs_attention = p_needs_attention)
      and (
        nullif(btrim(p_search), '') is null
        or position(lower(btrim(p_search)) in lower(concat_ws(' ',
          flow.customer_name,
          flow.reference_number,
          flow.drop_title,
          flow.source_id::text,
          flow.invitation_id::text,
          flow.order_id::text
        ))) > 0
      )
  ), page_rows as (
    select *
    from filtered
    order by
      needs_attention desc,
      case stage
        when 'new' then 1 when 'interest' then 2 when 'ready_to_invite' then 3
        when 'awaiting_payment' then 4 when 'paid_to_ship' then 5 when 'shipped' then 6 else 7
      end,
      last_activity_at desc,
      source_id
    limit p_limit offset p_offset
  )
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(to_jsonb(page_rows)) from page_rows), '[]'::jsonb),
    'page', jsonb_build_object('limit', p_limit, 'offset', p_offset, 'total', (select count(*) from filtered)),
    'drops', coalesce((select jsonb_agg(to_jsonb(d) order by d.drop_title) from public.admin_order_flow_drop_v1 d), '[]'::jsonb)
  ) into result;
  return result;
end
$function$;

create or replace function public.admin_order_flow_preview_action(p_actor uuid, p_action text, p_request jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  flow public.admin_order_flow_v1;
  product public.product_registry;
  qualified_units bigint;
begin
  if not exists (select 1 from public.admin_roles where user_id = p_actor and revoked_at is null) then
    raise exception using message = 'forbidden', errcode = 'P0001';
  end if;
  if p_action in ('drop.open.preview', 'delivery.confirm.preview', 'board.close.preview') and not exists (
    select 1 from public.admin_roles where user_id = p_actor and role = 'manager' and revoked_at is null
  ) then raise exception using message = 'insufficient_role', errcode = 'P0001'; end if;

  if p_action = 'board.process.preview' then
    select * into flow from public.admin_order_flow_v1
    where source_type = p_request->>'sourceType' and source_id = (p_request->>'sourceId')::uuid;
    if not found then raise exception using message = 'not_found', errcode = 'P0001'; end if;
    if flow.stage <> 'new' or flow.board_version <> (p_request->>'expectedVersion')::bigint then
      raise exception using message = 'stale_transition', errcode = 'P0001';
    end if;
    return jsonb_build_object('success', true, 'preview', jsonb_build_object(
      'sourceId', flow.source_id, 'sourceType', flow.source_type, 'dropTitle', flow.drop_title,
      'customer', flow.customer_name, 'currentStage', flow.stage,
      'nextStage', case when flow.drop_lifecycle_mode = 'preorder' then 'ready_to_invite' else 'interest' end,
      'boardVersion', flow.board_version
    ));
  elsif p_action = 'drop.open.preview' then
    select * into product from public.product_registry where product_code = p_request->>'productCode';
    if not found then raise exception using message = 'not_found', errcode = 'P0001'; end if;
    select d.qualified_units into qualified_units
    from public.admin_order_flow_drop_v1 d where d.product_code = product.product_code;
    if product.updated_at <> (p_request->>'expectedUpdatedAt')::timestamptz then
      raise exception using message = 'stale_transition', errcode = 'P0001';
    end if;
    if product.lifecycle_mode <> 'interest' or product.production_threshold is null or qualified_units < product.production_threshold then
      raise exception using message = 'invalid_transition', errcode = 'P0001';
    end if;
    return jsonb_build_object('success', true, 'preview', jsonb_build_object(
      'productCode', product.product_code, 'dropSlug', product.drop_slug, 'dropTitle', product.title,
      'qualifiedUnits', qualified_units, 'productionThreshold', product.production_threshold,
      'currentStage', product.lifecycle_mode, 'nextStage', 'preorder'
    ));
  elsif p_action in ('delivery.confirm.preview', 'board.close.preview') then
    select * into flow from public.admin_order_flow_v1
    where source_type = 'drop' and source_id = (p_request->>'sourceId')::uuid;
    if not found then raise exception using message = 'not_found', errcode = 'P0001'; end if;
    if flow.order_id is distinct from (p_request->>'orderId')::uuid
      or flow.board_version <> (p_request->>'expectedVersion')::bigint
      or flow.confirmed_payment_id is null or flow.fulfilment_status <> 'shipped'
      or flow.closed_at is not null then
      raise exception using message = 'stale_transition', errcode = 'P0001';
    end if;
    if p_action = 'delivery.confirm.preview' and flow.delivery_confirmed_at is not null then
      raise exception using message = 'invalid_transition', errcode = 'P0001';
    end if;
    if p_action = 'board.close.preview' and flow.delivery_confirmed_at is null then
      raise exception using message = 'delivery_not_confirmed', errcode = 'P0001';
    end if;
    return jsonb_build_object('success', true, 'preview', jsonb_build_object(
      'sourceId', flow.source_id, 'orderId', flow.order_id, 'dropTitle', flow.drop_title,
      'customer', flow.customer_name, 'fulfilmentStatus', flow.fulfilment_status,
      'carrier', flow.carrier, 'trackingPresent', flow.tracking_number is not null,
      'deliveryConfirmedAt', flow.delivery_confirmed_at, 'boardVersion', flow.board_version,
      'nextStage', case when p_action = 'board.close.preview' then 'closed' else 'delivery_confirmed' end
    ));
  end if;
  raise exception using message = 'invalid_action', errcode = 'P0001';
end
$function$;

create or replace function public.admin_order_flow_apply_action(
  p_actor uuid,
  p_action text,
  p_idempotency_key text,
  p_request_hash text,
  p_request jsonb,
  p_confirmation_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  prior public.admin_operation_idempotency;
  state public.admin_order_flow_state;
  reservation public.drop_interest_requests;
  customer_order public.orders;
  paid public.payments;
  product public.product_registry;
  qualified_units bigint;
  v_result jsonb;
begin
  if p_confirmation_hash is distinct from p_request_hash or p_request_hash !~ '^[a-f0-9]{64}$' then
    raise exception using message = 'confirmation_required', errcode = 'P0001';
  end if;
  if not exists (select 1 from public.admin_roles where user_id = p_actor and revoked_at is null) then
    raise exception using message = 'forbidden', errcode = 'P0001';
  end if;
  if p_action in ('drop.open', 'delivery.confirm', 'board.close') and not exists (
    select 1 from public.admin_roles where user_id = p_actor and role = 'manager' and revoked_at is null
  ) then raise exception using message = 'insufficient_role', errcode = 'P0001'; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_actor::text || ':' || p_action || ':' || p_idempotency_key, 0));
  select * into prior from public.admin_operation_idempotency
  where actor_user_id = p_actor and action = p_action and idempotency_key = p_idempotency_key for update;
  if found then
    if prior.request_hash <> p_request_hash then raise exception using message = 'idempotency_conflict', errcode = 'P0001'; end if;
    if prior.result is null then raise exception using message = 'operation_in_progress', errcode = 'P0001'; end if;
    return prior.result || jsonb_build_object('replay', true);
  end if;
  insert into public.admin_operation_idempotency(actor_user_id, action, idempotency_key, request_hash)
  values (p_actor, p_action, p_idempotency_key, p_request_hash);

  if p_action = 'board.process' then
    select * into reservation from public.drop_interest_requests
    where id = (p_request->>'sourceId')::uuid for update;
    if not found then raise exception using message = 'not_found', errcode = 'P0001'; end if;
    select * into state from public.admin_order_flow_state
    where drop_interest_request_id = reservation.id for update;
    if coalesce(state.version, 0) <> (p_request->>'expectedVersion')::bigint or state.processed_at is not null
      or reservation.reservation_status <> 'new' or reservation.status <> 'new' then
      raise exception using message = 'stale_transition', errcode = 'P0001';
    end if;
    insert into public.admin_order_flow_state(drop_interest_request_id, processed_at, processed_by, version)
    values (reservation.id, now(), p_actor, 1)
    on conflict (drop_interest_request_id) do update
      set processed_at = excluded.processed_at, processed_by = excluded.processed_by,
          version = public.admin_order_flow_state.version + 1, updated_at = now()
      where public.admin_order_flow_state.processed_at is null;
    insert into public.admin_audit_events(actor_user_id, action, entity_type, entity_id, idempotency_key, details)
    values (p_actor, 'order_flow.processed', 'reservation', reservation.id::text, p_idempotency_key,
      jsonb_build_object('source_type', 'drop'));
    insert into public.entity_events(actor_user_id, source, event_type, entity_type, entity_id, idempotency_key, payload)
    values (p_actor, 'admin', 'order_flow.processed', 'reservation', reservation.id::text, p_idempotency_key,
      jsonb_build_object('source_type', 'drop'));
    v_result := jsonb_build_object('success', true, 'entityId', reservation.id, 'boardStage', 'interest',
      'boardVersion', coalesce(state.version, 0) + 1);

  elsif p_action = 'drop.open' then
    select * into product from public.product_registry
    where product_code = p_request->>'productCode' for update;
    if not found then raise exception using message = 'not_found', errcode = 'P0001'; end if;
    -- Serialize the threshold snapshot with manager origin corrections. Lock every
    -- reservation for this drop because a concurrent correction can move a row
    -- either into or out of the customer-qualified set.
    perform 1
    from public.drop_interest_requests r
    where r.drop_slug = product.drop_slug
    order by r.id
    for update;
    select d.qualified_units into qualified_units from public.admin_order_flow_drop_v1 d
    where d.product_code = product.product_code;
    if product.updated_at <> (p_request->>'expectedUpdatedAt')::timestamptz then
      raise exception using message = 'stale_transition', errcode = 'P0001';
    end if;
    if product.lifecycle_mode <> 'interest' or product.production_threshold is null or qualified_units < product.production_threshold then
      raise exception using message = 'invalid_transition', errcode = 'P0001';
    end if;
    update public.product_registry
    set lifecycle_mode = 'preorder', invitations_opened_at = now(), invitations_opened_by = p_actor, updated_at = now()
    where product_code = product.product_code;
    insert into public.admin_audit_events(actor_user_id, action, entity_type, entity_id, idempotency_key, details)
    values (p_actor, 'drop.invitations_opened', 'product', product.product_code, p_idempotency_key,
      jsonb_build_object('drop_slug', product.drop_slug, 'qualified_units', qualified_units,
        'production_threshold', product.production_threshold));
    insert into public.entity_events(actor_user_id, source, event_type, entity_type, entity_id, idempotency_key, payload)
    values (p_actor, 'admin', 'drop.invitations_opened', 'product', product.product_code, p_idempotency_key,
      jsonb_build_object('drop_slug', product.drop_slug, 'qualified_units', qualified_units));
    v_result := jsonb_build_object('success', true, 'entityId', product.product_code, 'dropLifecycleMode', 'preorder');

  elsif p_action in ('delivery.confirm', 'board.close') then
    select * into reservation from public.drop_interest_requests
    where id = (p_request->>'sourceId')::uuid for update;
    if not found then raise exception using message = 'not_found', errcode = 'P0001'; end if;
    select * into customer_order from public.orders
    where id = (p_request->>'orderId')::uuid and interest_request_id = reservation.id for update;
    if not found then raise exception using message = 'not_found', errcode = 'P0001'; end if;
    select * into paid from public.payments
    where order_id = customer_order.id and provider = 'mollie' and status = 'paid'
      and provider_payment_id is not null and webhook_received_at is not null and paid_at is not null
      and amount = customer_order.total_amount and currency = customer_order.currency
    order by paid_at desc limit 1 for update;
    if customer_order.status <> 'paid' or customer_order.fulfilment_status <> 'shipped' or paid.id is null then
      raise exception using message = 'payment_not_confirmed', errcode = 'P0001';
    end if;
    select * into state from public.admin_order_flow_state
    where drop_interest_request_id = reservation.id for update;
    if coalesce(state.version, 0) <> (p_request->>'expectedVersion')::bigint or state.closed_at is not null then
      raise exception using message = 'stale_transition', errcode = 'P0001';
    end if;

    if p_action = 'delivery.confirm' then
      if state.delivery_confirmed_at is not null then raise exception using message = 'invalid_transition', errcode = 'P0001'; end if;
      insert into public.admin_order_flow_state(
        drop_interest_request_id, delivery_confirmed_at, delivery_confirmed_by, version
      ) values (reservation.id, now(), p_actor, 1)
      on conflict (drop_interest_request_id) do update
        set delivery_confirmed_at = excluded.delivery_confirmed_at,
            delivery_confirmed_by = excluded.delivery_confirmed_by,
            version = public.admin_order_flow_state.version + 1,
            updated_at = now();
      insert into public.admin_audit_events(actor_user_id, action, entity_type, entity_id, idempotency_key, details)
      values (p_actor, 'delivery.confirmed', 'order', customer_order.id::text, p_idempotency_key,
        jsonb_build_object('fulfilment_status', customer_order.fulfilment_status, 'tracking_present', true));
      insert into public.entity_events(actor_user_id, source, event_type, entity_type, entity_id, idempotency_key, payload)
      values (p_actor, 'admin', 'delivery.confirmed', 'order', customer_order.id::text, p_idempotency_key,
        jsonb_build_object('fulfilment_status', customer_order.fulfilment_status));
      v_result := jsonb_build_object('success', true, 'entityId', customer_order.id, 'deliveryConfirmed', true,
        'boardStage', 'shipped', 'boardVersion', coalesce(state.version, 0) + 1);
    else
      if state.delivery_confirmed_at is null then raise exception using message = 'delivery_not_confirmed', errcode = 'P0001'; end if;
      update public.admin_order_flow_state
      set closed_at = now(), closed_by = p_actor,
          closed_order_status = customer_order.status,
          closed_fulfilment_status = customer_order.fulfilment_status,
          version = version + 1, updated_at = now()
      where drop_interest_request_id = reservation.id;
      insert into public.admin_audit_events(actor_user_id, action, entity_type, entity_id, idempotency_key, details)
      values (p_actor, 'order_flow.closed', 'order', customer_order.id::text, p_idempotency_key,
        jsonb_build_object('order_status', customer_order.status, 'fulfilment_status', customer_order.fulfilment_status));
      insert into public.entity_events(actor_user_id, source, event_type, entity_type, entity_id, idempotency_key, payload)
      values (p_actor, 'admin', 'order_flow.closed', 'order', customer_order.id::text, p_idempotency_key,
        jsonb_build_object('order_status', customer_order.status, 'fulfilment_status', customer_order.fulfilment_status));
      v_result := jsonb_build_object('success', true, 'entityId', customer_order.id, 'boardStage', 'closed',
        'boardVersion', state.version + 1);
    end if;
  else
    raise exception using message = 'invalid_action', errcode = 'P0001';
  end if;

  update public.admin_operation_idempotency
  set result = v_result, completed_at = now()
  where actor_user_id = p_actor and action = p_action and idempotency_key = p_idempotency_key;
  return v_result || jsonb_build_object('replay', false);
end
$function$;

create or replace function public.admin_order_flow_record_paid_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if tg_op = 'INSERT' then
    if new.provider = 'mollie' and new.status = 'paid'
      and new.provider_payment_id is not null and new.webhook_received_at is not null and new.paid_at is not null then
      insert into public.entity_events(source, event_type, entity_type, entity_id, idempotency_key, payload)
      values ('provider', 'payment.paid', 'order', new.order_id::text, new.provider_payment_id,
        jsonb_build_object('provider', new.provider, 'payment_status', new.status, 'webhook_confirmed', true))
      on conflict do nothing;
    end if;
  elsif new.provider = 'mollie' and new.status = 'paid'
    and new.provider_payment_id is not null and new.webhook_received_at is not null and new.paid_at is not null
    and (
      old.status is distinct from new.status
      or old.provider_payment_id is distinct from new.provider_payment_id
      or old.webhook_received_at is distinct from new.webhook_received_at
      or old.paid_at is distinct from new.paid_at
    ) then
    insert into public.entity_events(source, event_type, entity_type, entity_id, idempotency_key, payload)
    values ('provider', 'payment.paid', 'order', new.order_id::text, new.provider_payment_id,
      jsonb_build_object('provider', new.provider, 'payment_status', new.status, 'webhook_confirmed', true))
    on conflict do nothing;
  end if;
  return new;
end
$function$;

create trigger payments_order_flow_paid_event
after insert or update of status on public.payments
for each row execute function public.admin_order_flow_record_paid_event();

revoke all on table public.admin_order_flow_state from public, anon, authenticated, service_role;
revoke all on table public.admin_order_flow_v1, public.admin_order_flow_drop_v1 from public, anon, authenticated, service_role;
grant select on table public.admin_order_flow_state, public.admin_order_flow_v1, public.admin_order_flow_drop_v1 to service_role;

revoke all on function public.admin_order_flow_read(uuid,text,text,text,text,boolean,boolean,integer,integer) from public, anon, authenticated, service_role;
revoke all on function public.admin_order_flow_preview_action(uuid,text,jsonb) from public, anon, authenticated, service_role;
revoke all on function public.admin_order_flow_apply_action(uuid,text,text,text,jsonb,text) from public, anon, authenticated, service_role;
revoke all on function public.admin_order_flow_record_paid_event() from public, anon, authenticated, service_role;
grant execute on function public.admin_order_flow_read(uuid,text,text,text,text,boolean,boolean,integer,integer) to service_role;
grant execute on function public.admin_order_flow_preview_action(uuid,text,jsonb) to service_role;
grant execute on function public.admin_order_flow_apply_action(uuid,text,text,text,jsonb,text) to service_role;

commit;
