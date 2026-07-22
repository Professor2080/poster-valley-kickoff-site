-- A4 additive reporting and controlled export contracts.
-- Apply only through the reviewed migration workflow, first to the isolated Staging project.
-- This file does not authorize a Production migration, deployment, email or payment.

create or replace function public.admin_a4_report(
  p_actor uuid,
  p_from timestamptz default null,
  p_to timestamptz default now(),
  p_drop_slug text default null,
  p_destination_country_code text default null,
  p_order_status text default null,
  p_fulfilment_status text default null,
  p_delivery_status text default null,
  p_include_non_customer boolean default false
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  result jsonb;
begin
  if not exists (
    select 1 from public.admin_roles
    where user_id = p_actor and role = 'manager' and revoked_at is null
  ) then raise exception using message = 'insufficient_role', errcode = 'P0001'; end if;
  if p_to is null or (p_from is not null and (p_from >= p_to or p_to - p_from > interval '366 days')) then
    raise exception using message = 'invalid_report_period', errcode = 'P0001';
  end if;
  if p_drop_slug is not null and (length(p_drop_slug) > 120 or p_drop_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$') then
    raise exception using message = 'invalid_report_filter', errcode = 'P0001';
  end if;
  if p_destination_country_code is not null and p_destination_country_code !~ '^[A-Z]{2}$' then
    raise exception using message = 'invalid_report_filter', errcode = 'P0001';
  end if;
  if p_order_status is not null and p_order_status not in ('draft','awaiting_payment','payment_open','paid','payment_failed','payment_expired','cancelled','shipped') then
    raise exception using message = 'invalid_report_filter', errcode = 'P0001';
  end if;
  if p_fulfilment_status is not null and p_fulfilment_status not in ('unfulfilled','ready_to_pack','packed','shipped') then
    raise exception using message = 'invalid_report_filter', errcode = 'P0001';
  end if;
  if p_delivery_status is not null and p_delivery_status not in ('pending','failed','suppressed','sent') then
    raise exception using message = 'invalid_report_filter', errcode = 'P0001';
  end if;

  with
  reservation_scope as (
    select r.*
    from public.drop_interest_requests r
    where (p_from is null or r.created_at >= p_from) and r.created_at < p_to
      and (p_drop_slug is null or r.drop_slug = p_drop_slug)
      and (p_include_non_customer or r.record_origin = 'customer')
  ),
  invitation_scope as (
    select i.*, coalesce(r.record_origin, 'customer'::public.record_origin) as lineage_origin
    from public.order_invitations i
    left join public.drop_interest_requests r on r.id = i.interest_request_id
    where i.sent_at is not null
      and (p_from is null or i.sent_at >= p_from) and i.sent_at < p_to
      and (p_drop_slug is null or i.drop_slug = p_drop_slug)
      and (p_include_non_customer or coalesce(r.record_origin, 'customer'::public.record_origin) = 'customer')
  ),
  order_scope as (
    select o.*, coalesce(r.record_origin, 'customer'::public.record_origin) as lineage_origin
    from public.orders o
    left join public.drop_interest_requests r on r.id = o.interest_request_id
    where (p_from is null or o.created_at >= p_from) and o.created_at < p_to
      and (p_drop_slug is null or o.drop_slug = p_drop_slug)
      and (p_destination_country_code is null or o.shipping_country_code = p_destination_country_code)
      and (p_order_status is null or o.status = p_order_status)
      and (p_fulfilment_status is null or o.fulfilment_status = p_fulfilment_status)
      and (p_include_non_customer or coalesce(r.record_origin, 'customer'::public.record_origin) = 'customer')
  ),
  canonical_payment as (
    select distinct on (p.order_id)
      p.id as payment_id, p.order_id, p.paid_at, p.created_at as payment_created_at
    from public.payments p
    join public.orders o on o.id = p.order_id
    where p.provider = 'mollie' and p.status = 'paid'
      and nullif(btrim(p.provider_payment_id), '') is not null
      and p.webhook_received_at is not null and p.paid_at is not null
      and p.amount = o.total_amount and p.currency = o.currency
    order by p.order_id, p.paid_at, p.created_at, p.id
  ),
  paid_scope as (
    select o.*, cp.payment_id, cp.paid_at,
      coalesce(r.record_origin, 'customer'::public.record_origin) as lineage_origin,
      public.admin_a31_order_address_complete(o) as address_complete
    from canonical_payment cp
    join public.orders o on o.id = cp.order_id
    left join public.drop_interest_requests r on r.id = o.interest_request_id
    where (p_from is null or cp.paid_at >= p_from) and cp.paid_at < p_to
      and (p_drop_slug is null or o.drop_slug = p_drop_slug)
      and (p_destination_country_code is null or o.shipping_country_code = p_destination_country_code)
      and (p_order_status is null or o.status = p_order_status)
      and (p_fulfilment_status is null or o.fulfilment_status = p_fulfilment_status)
      and (p_include_non_customer or coalesce(r.record_origin, 'customer'::public.record_origin) = 'customer')
  ),
  latest_delivery as (
    select distinct on (a.entity_id)
      a.entity_id::uuid as invitation_id, a.delivery_status, a.created_at, a.completed_at
    from public.operational_email_attempts a
    where a.template = 'order_invitation' and a.entity_type = 'order_invitation'
    order by a.entity_id, a.created_at desc, a.id desc
  ),
  delivery_scope as (
    select i.id, i.drop_slug, i.drop_title, i.sent_at, i.created_at,
      latest_delivery.delivery_status, latest_delivery.created_at as delivery_created_at
    from public.order_invitations i
    join latest_delivery on latest_delivery.invitation_id = i.id
    left join public.drop_interest_requests r on r.id = i.interest_request_id
    where latest_delivery.delivery_status in ('pending','failed')
      and (p_delivery_status is null or latest_delivery.delivery_status = p_delivery_status)
      and (p_from is null or coalesce(i.sent_at, i.created_at) >= p_from)
      and coalesce(i.sent_at, i.created_at) < p_to
      and (p_drop_slug is null or i.drop_slug = p_drop_slug)
      and (p_include_non_customer or coalesce(r.record_origin, 'customer'::public.record_origin) = 'customer')
  ),
  product_keys as (
    select drop_slug, max(drop_title) as drop_title from (
      select drop_slug, drop_title from reservation_scope
      union all select drop_slug, drop_title from invitation_scope
      union all select drop_slug, drop_title from order_scope
      union all select drop_slug, drop_title from paid_scope
    ) products group by drop_slug
  ),
  country_keys as (
    select shipping_country_code from (
      select shipping_country_code from order_scope
      union select shipping_country_code from paid_scope
    ) countries where shipping_country_code is not null group by shipping_country_code
  )
  select jsonb_build_object(
    'version', 'v1',
    'generatedAt', now(),
    'currencyPolicy', jsonb_build_object(
      'currentSupportedCurrency', 'EUR',
      'groupedByCurrency', true,
      'revenueLabel', 'Paid gross revenue',
      'refundSupport', false,
      'accountingOutput', false
    ),
    'summary', jsonb_build_object(
      'reservations', (select count(*) from reservation_scope),
      'invitationsSent', (select count(*) from invitation_scope),
      'ordersStarted', (select count(*) from order_scope),
      'paidOrders', (select count(*) from paid_scope),
      'revenue', coalesce((
        select jsonb_agg(jsonb_build_object('currency', currency, 'amount', amount, 'paidOrders', paid_orders) order by currency)
        from (select currency, round(sum(total_amount), 2) as amount, count(*) as paid_orders from paid_scope group by currency) totals
      ), '[]'::jsonb),
      'averageOrderValue', coalesce((
        select jsonb_agg(jsonb_build_object('currency', currency, 'amount', amount) order by currency)
        from (select currency, round(sum(total_amount) / nullif(count(*), 0), 2) as amount from paid_scope group by currency) averages
      ), '[]'::jsonb),
      'conversion', jsonb_build_object(
        'reservationToInvitation', jsonb_build_object(
          'numerator', (select count(*) from reservation_scope r where exists (select 1 from public.order_invitations i where i.interest_request_id = r.id and i.sent_at is not null)),
          'denominator', (select count(*) from reservation_scope)
        ),
        'invitationToOrder', jsonb_build_object(
          'numerator', (select count(*) from invitation_scope i where exists (select 1 from public.orders o where o.invitation_id = i.id)),
          'denominator', (select count(*) from invitation_scope)
        ),
        'orderToPaid', jsonb_build_object(
          'numerator', (select count(*) from order_scope o where exists (select 1 from canonical_payment cp where cp.order_id = o.id)),
          'denominator', (select count(*) from order_scope)
        )
      ),
      'openFulfilment', (select count(*) from paid_scope where fulfilment_status <> 'shipped'),
      'fulfilmentAttention', (select count(*) from paid_scope where
        (fulfilment_status <> 'shipped' and (fulfilment_status in ('ready_to_pack','packed') or not address_complete))
        or (fulfilment_status = 'shipped' and shipping_email_status = 'failed')
      ),
      'invitationDeliveryPending', (select count(*) from delivery_scope where delivery_status = 'pending'),
      'invitationDeliveryFailed', (select count(*) from delivery_scope where delivery_status = 'failed')
    ),
    'byProduct', coalesce((
      select jsonb_agg(jsonb_build_object(
        'dropSlug', k.drop_slug,
        'dropTitle', k.drop_title,
        'reservations', (select count(*) from reservation_scope r where r.drop_slug = k.drop_slug),
        'invitationsSent', (select count(*) from invitation_scope i where i.drop_slug = k.drop_slug),
        'ordersStarted', (select count(*) from order_scope o where o.drop_slug = k.drop_slug),
        'paidOrders', (select count(*) from paid_scope p where p.drop_slug = k.drop_slug),
        'openFulfilment', (select count(*) from paid_scope p where p.drop_slug = k.drop_slug and p.fulfilment_status <> 'shipped'),
        'revenue', coalesce((select jsonb_agg(jsonb_build_object('currency', currency, 'amount', amount) order by currency)
          from (select currency, round(sum(total_amount), 2) as amount from paid_scope p where p.drop_slug = k.drop_slug group by currency) product_totals), '[]'::jsonb)
      ) order by k.drop_title, k.drop_slug) from product_keys k
    ), '[]'::jsonb),
    'byCountry', coalesce((
      select jsonb_agg(jsonb_build_object(
        'countryCode', k.shipping_country_code,
        'ordersStarted', (select count(*) from order_scope o where o.shipping_country_code = k.shipping_country_code),
        'paidOrders', (select count(*) from paid_scope p where p.shipping_country_code = k.shipping_country_code),
        'openFulfilment', (select count(*) from paid_scope p where p.shipping_country_code = k.shipping_country_code and p.fulfilment_status <> 'shipped'),
        'revenue', coalesce((select jsonb_agg(jsonb_build_object('currency', currency, 'amount', amount) order by currency)
          from (select currency, round(sum(total_amount), 2) as amount from paid_scope p where p.shipping_country_code = k.shipping_country_code group by currency) country_totals), '[]'::jsonb)
      ) order by k.shipping_country_code) from country_keys k
    ), '[]'::jsonb),
    'queues', jsonb_build_object(
      'fulfilment', coalesce((select jsonb_agg(jsonb_build_object(
        'orderId', id, 'dropSlug', drop_slug, 'dropTitle', drop_title,
        'fulfilmentStatus', fulfilment_status, 'shippingEmailStatus', shipping_email_status,
        'destinationCountryCode', shipping_country_code, 'paidAt', paid_at,
        'attentionRequired', ((fulfilment_status in ('ready_to_pack','packed')) or not address_complete)
      ) order by paid_at, id) from (select * from paid_scope where fulfilment_status <> 'shipped' order by paid_at, id limit 100) queue), '[]'::jsonb),
      'invitationDelivery', coalesce((select jsonb_agg(jsonb_build_object(
        'invitationId', id, 'dropSlug', drop_slug, 'dropTitle', drop_title,
        'deliveryStatus', delivery_status, 'deliveryCreatedAt', delivery_created_at
      ) order by delivery_created_at, id) from (select * from delivery_scope order by delivery_created_at, id limit 100) queue), '[]'::jsonb)
    ),
    'filterApplicability', jsonb_build_object(
      'dropSlug', 'all metrics',
      'destinationCountryCode', 'order, payment, revenue and fulfilment metrics only',
      'orderStatus', 'order, payment, revenue and fulfilment metrics only',
      'fulfilmentStatus', 'order, payment, revenue and fulfilment metrics only',
      'deliveryStatus', 'invitation delivery queue only'
    )
  ) into result;

  return result;
end $$;

create or replace function public.admin_a4_export_rows(
  p_actor uuid,
  p_export_type text,
  p_from timestamptz,
  p_to timestamptz,
  p_drop_slug text default null,
  p_destination_country_code text default null,
  p_order_status text default null,
  p_fulfilment_status text default null,
  p_delivery_status text default null,
  p_include_non_customer boolean default false
) returns table(sort_at timestamptz, sort_key text, row_data jsonb)
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not exists (
    select 1 from public.admin_roles
    where user_id = p_actor and role = 'manager' and revoked_at is null
  ) then raise exception using message = 'insufficient_role', errcode = 'P0001'; end if;
  if p_export_type not in ('reservations','invitations','orders','payments','fulfilment','summary') then
    raise exception using message = 'invalid_export_type', errcode = 'P0001';
  end if;
  if p_from is null or p_to is null or p_from >= p_to or p_to - p_from > interval '90 days' then
    raise exception using message = 'invalid_export_period', errcode = 'P0001';
  end if;
  if p_drop_slug is not null and (length(p_drop_slug) > 120 or p_drop_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$') then
    raise exception using message = 'invalid_report_filter', errcode = 'P0001';
  end if;
  if p_destination_country_code is not null and p_destination_country_code !~ '^[A-Z]{2}$' then
    raise exception using message = 'invalid_report_filter', errcode = 'P0001';
  end if;
  if p_order_status is not null and p_order_status not in ('draft','awaiting_payment','payment_open','paid','payment_failed','payment_expired','cancelled','shipped') then
    raise exception using message = 'invalid_report_filter', errcode = 'P0001';
  end if;
  if p_fulfilment_status is not null and p_fulfilment_status not in ('unfulfilled','ready_to_pack','packed','shipped') then
    raise exception using message = 'invalid_report_filter', errcode = 'P0001';
  end if;
  if p_delivery_status is not null and p_delivery_status not in ('pending','failed','suppressed','sent') then
    raise exception using message = 'invalid_report_filter', errcode = 'P0001';
  end if;

  if p_export_type = 'reservations' then
    return query select r.created_at, r.id::text, jsonb_build_object(
      'reservation_id', r.id, 'created_at', r.created_at, 'design_slug', r.drop_slug,
      'design_title', r.drop_title, 'preferred_format', r.preferred_format,
      'quantity', r.quantity, 'contact_country_code', r.country_code,
      'reservation_status', r.reservation_status, 'record_origin', r.record_origin
    ) from public.drop_interest_requests r
    where r.created_at >= p_from and r.created_at < p_to
      and (p_drop_slug is null or r.drop_slug = p_drop_slug)
      and (p_include_non_customer or r.record_origin = 'customer');
  elsif p_export_type = 'invitations' then
    return query select i.created_at, i.id::text, jsonb_build_object(
      'invitation_id', i.id, 'reservation_id', i.interest_request_id,
      'created_at', i.created_at, 'sent_at', i.sent_at, 'design_slug', i.drop_slug,
      'design_title', i.drop_title, 'quantity', i.quantity, 'currency', i.currency,
      'unit_price', i.unit_price, 'subtotal_amount', i.subtotal_amount,
      'invitation_status', i.status, 'expires_at', i.expires_at,
      'delivery_status', latest.delivery_status,
      'delivery_completed_at', latest.completed_at,
      'record_origin', coalesce(r.record_origin, 'customer'::public.record_origin)
    ) from public.order_invitations i
    left join public.drop_interest_requests r on r.id = i.interest_request_id
    left join lateral (
      select a.delivery_status, a.completed_at from public.operational_email_attempts a
      where a.template = 'order_invitation' and a.entity_type = 'order_invitation' and a.entity_id = i.id::text
      order by a.created_at desc, a.id desc limit 1
    ) latest on true
    where i.created_at >= p_from and i.created_at < p_to
      and (p_drop_slug is null or i.drop_slug = p_drop_slug)
      and (p_delivery_status is null or latest.delivery_status = p_delivery_status)
      and (p_include_non_customer or coalesce(r.record_origin, 'customer'::public.record_origin) = 'customer');
  elsif p_export_type = 'orders' then
    return query select o.created_at, o.id::text, jsonb_build_object(
      'order_id', o.id, 'invitation_id', o.invitation_id, 'reservation_id', o.interest_request_id,
      'created_at', o.created_at, 'design_slug', o.drop_slug, 'design_title', o.drop_title,
      'order_status', o.status, 'payment_status', latest_payment.status,
      'fulfilment_status', o.fulfilment_status, 'quantity', o.quantity, 'currency', o.currency,
      'subtotal_amount', o.subtotal_amount, 'shipping_amount', o.shipping_amount,
      'total_amount', o.total_amount, 'destination_country_code', o.shipping_country_code,
      'record_origin', coalesce(r.record_origin, 'customer'::public.record_origin)
    ) from public.orders o
    left join public.drop_interest_requests r on r.id = o.interest_request_id
    left join lateral (select p.status from public.payments p where p.order_id = o.id order by p.created_at desc, p.id desc limit 1) latest_payment on true
    where o.created_at >= p_from and o.created_at < p_to
      and (p_drop_slug is null or o.drop_slug = p_drop_slug)
      and (p_destination_country_code is null or o.shipping_country_code = p_destination_country_code)
      and (p_order_status is null or o.status = p_order_status)
      and (p_fulfilment_status is null or o.fulfilment_status = p_fulfilment_status)
      and (p_include_non_customer or coalesce(r.record_origin, 'customer'::public.record_origin) = 'customer');
  elsif p_export_type = 'payments' then
    return query select p.created_at, p.id::text, jsonb_build_object(
      'payment_id', p.id, 'order_id', p.order_id, 'created_at', p.created_at,
      'provider', p.provider, 'payment_status', p.status, 'amount', p.amount,
      'currency', p.currency, 'webhook_received_at', p.webhook_received_at,
      'paid_at', p.paid_at, 'record_origin', coalesce(r.record_origin, 'customer'::public.record_origin)
    ) from public.payments p
    join public.orders o on o.id = p.order_id
    left join public.drop_interest_requests r on r.id = o.interest_request_id
    where p.created_at >= p_from and p.created_at < p_to
      and (p_drop_slug is null or o.drop_slug = p_drop_slug)
      and (p_destination_country_code is null or o.shipping_country_code = p_destination_country_code)
      and (p_order_status is null or o.status = p_order_status)
      and (p_fulfilment_status is null or o.fulfilment_status = p_fulfilment_status)
      and (p_include_non_customer or coalesce(r.record_origin, 'customer'::public.record_origin) = 'customer');
  elsif p_export_type = 'fulfilment' then
    return query
    with canonical as (
      select distinct on (p.order_id) p.order_id, p.paid_at
      from public.payments p join public.orders o on o.id = p.order_id
      where p.provider = 'mollie' and p.status = 'paid'
        and nullif(btrim(p.provider_payment_id), '') is not null
        and p.webhook_received_at is not null and p.paid_at is not null
        and p.amount = o.total_amount and p.currency = o.currency
      order by p.order_id, p.paid_at, p.created_at, p.id
    )
    select c.paid_at, o.id::text, jsonb_build_object(
      'order_id', o.id, 'paid_at', c.paid_at, 'design_slug', o.drop_slug,
      'design_title', o.drop_title, 'order_status', o.status,
      'fulfilment_status', o.fulfilment_status, 'quantity', o.quantity,
      'currency', o.currency, 'total_amount', o.total_amount,
      'destination_country_code', o.shipping_country_code, 'carrier', o.carrier,
      'tracking_present', nullif(btrim(o.tracking_number), '') is not null,
      'shipped_at', o.shipped_at, 'shipping_email_status', o.shipping_email_status,
      'record_origin', coalesce(r.record_origin, 'customer'::public.record_origin)
    ) from canonical c join public.orders o on o.id = c.order_id
    left join public.drop_interest_requests r on r.id = o.interest_request_id
    where c.paid_at >= p_from and c.paid_at < p_to
      and (p_drop_slug is null or o.drop_slug = p_drop_slug)
      and (p_destination_country_code is null or o.shipping_country_code = p_destination_country_code)
      and (p_order_status is null or o.status = p_order_status)
      and (p_fulfilment_status is null or o.fulfilment_status = p_fulfilment_status)
      and (p_include_non_customer or coalesce(r.record_origin, 'customer'::public.record_origin) = 'customer');
  else
    return query
    with canonical as (
      select distinct on (p.order_id) p.order_id, p.paid_at
      from public.payments p join public.orders o on o.id = p.order_id
      where p.provider = 'mollie' and p.status = 'paid'
        and nullif(btrim(p.provider_payment_id), '') is not null
        and p.webhook_received_at is not null and p.paid_at is not null
        and p.amount = o.total_amount and p.currency = o.currency
      order by p.order_id, p.paid_at, p.created_at, p.id
    ), paid as (
      select o.*, c.paid_at, coalesce(r.record_origin, 'customer'::public.record_origin) as lineage_origin
      from canonical c join public.orders o on o.id = c.order_id
      left join public.drop_interest_requests r on r.id = o.interest_request_id
      where c.paid_at >= p_from and c.paid_at < p_to
        and (p_drop_slug is null or o.drop_slug = p_drop_slug)
        and (p_destination_country_code is null or o.shipping_country_code = p_destination_country_code)
        and (p_order_status is null or o.status = p_order_status)
        and (p_fulfilment_status is null or o.fulfilment_status = p_fulfilment_status)
        and (p_include_non_customer or coalesce(r.record_origin, 'customer'::public.record_origin) = 'customer')
    ), summaries as (
      select min(paid_at) as sort_at, 'product:' || drop_slug || ':' || currency as sort_key,
        jsonb_build_object('group_type','product','design_slug',drop_slug,'design_title',max(drop_title),
          'destination_country_code',null,'currency',currency,'paid_orders',count(*),
          'paid_gross_revenue',round(sum(total_amount),2)) as row_data
      from paid group by drop_slug, currency
      union all
      select min(paid_at), 'country:' || shipping_country_code || ':' || currency,
        jsonb_build_object('group_type','destination_country','design_slug',null,'design_title',null,
          'destination_country_code',shipping_country_code,'currency',currency,'paid_orders',count(*),
          'paid_gross_revenue',round(sum(total_amount),2))
      from paid group by shipping_country_code, currency
    ) select summaries.sort_at, summaries.sort_key, summaries.row_data from summaries;
  end if;
end $$;

create or replace function public.admin_a4_export_preview(
  p_actor uuid,
  p_export_type text,
  p_from timestamptz,
  p_to timestamptz,
  p_drop_slug text default null,
  p_destination_country_code text default null,
  p_order_status text default null,
  p_fulfilment_status text default null,
  p_delivery_status text default null,
  p_include_non_customer boolean default false
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare row_count integer; content_fingerprint text;
begin
  select count(*), md5(coalesce(string_agg(
      concat_ws(chr(31), extract(epoch from sort_at)::text, sort_key, row_data::text),
      chr(30) order by sort_at desc, sort_key
    ), '')) into row_count, content_fingerprint from (
    select * from public.admin_a4_export_rows(
      p_actor,p_export_type,p_from,p_to,p_drop_slug,p_destination_country_code,
      p_order_status,p_fulfilment_status,p_delivery_status,p_include_non_customer
    ) order by sort_at desc, sort_key limit 2001
  ) bounded;
  return jsonb_build_object(
    'recordCount', least(row_count, 2000), 'exceedsLimit', row_count > 2000,
    'maximumRecords', 2000, 'contentFingerprint', content_fingerprint
  );
end $$;

create or replace function public.admin_a4_export(
  p_actor uuid,
  p_export_type text,
  p_from timestamptz,
  p_to timestamptz,
  p_drop_slug text default null,
  p_destination_country_code text default null,
  p_order_status text default null,
  p_fulfilment_status text default null,
  p_delivery_status text default null,
  p_include_non_customer boolean default false,
  p_expected_fingerprint text default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare row_count integer; rows jsonb; content_fingerprint text; export_id uuid := extensions.gen_random_uuid();
begin
  select count(*), coalesce(jsonb_agg(row_data order by sort_at desc, sort_key), '[]'::jsonb),
    md5(coalesce(string_agg(
      concat_ws(chr(31), extract(epoch from sort_at)::text, sort_key, row_data::text),
      chr(30) order by sort_at desc, sort_key
    ), ''))
    into row_count, rows, content_fingerprint
  from (
    select * from public.admin_a4_export_rows(
      p_actor,p_export_type,p_from,p_to,p_drop_slug,p_destination_country_code,
      p_order_status,p_fulfilment_status,p_delivery_status,p_include_non_customer
    ) order by sort_at desc, sort_key limit 2001
  ) bounded;
  if row_count > 2000 then raise exception using message = 'export_limit_exceeded', errcode = 'P0001'; end if;
  if p_expected_fingerprint is null or p_expected_fingerprint !~ '^[a-f0-9]{32}$'
    or content_fingerprint <> p_expected_fingerprint then
    raise exception using message = 'confirmation_stale', errcode = 'P0001';
  end if;

  insert into public.admin_audit_events(actor_user_id, action, entity_type, entity_id, correlation_id, details)
  values(p_actor, 'report.export.generated', 'report_export', export_id::text, export_id,
    jsonb_build_object(
      'export_type', p_export_type,
      'filters', jsonb_build_object(
        'from', p_from, 'to', p_to, 'drop_slug', p_drop_slug,
        'destination_country_code', p_destination_country_code,
        'order_status', p_order_status, 'fulfilment_status', p_fulfilment_status,
        'delivery_status', p_delivery_status, 'include_non_customer', p_include_non_customer
      ),
      'record_count', row_count,
      'maximum_records', 2000,
      'contains_personal_contact_or_address_data', false
    ));
  return jsonb_build_object('exportId', export_id, 'recordCount', row_count, 'rows', rows);
end $$;

revoke all on function public.admin_a4_report(uuid,timestamptz,timestamptz,text,text,text,text,text,boolean) from public, anon, authenticated;
revoke all on function public.admin_a4_export_rows(uuid,text,timestamptz,timestamptz,text,text,text,text,text,boolean) from public, anon, authenticated;
revoke all on function public.admin_a4_export_preview(uuid,text,timestamptz,timestamptz,text,text,text,text,text,boolean) from public, anon, authenticated;
revoke all on function public.admin_a4_export(uuid,text,timestamptz,timestamptz,text,text,text,text,text,boolean,text) from public, anon, authenticated;
grant execute on function public.admin_a4_report(uuid,timestamptz,timestamptz,text,text,text,text,text,boolean) to service_role;
grant execute on function public.admin_a4_export_rows(uuid,text,timestamptz,timestamptz,text,text,text,text,text,boolean) to service_role;
grant execute on function public.admin_a4_export_preview(uuid,text,timestamptz,timestamptz,text,text,text,text,text,boolean) to service_role;
grant execute on function public.admin_a4_export(uuid,text,timestamptz,timestamptz,text,text,text,text,text,boolean,text) to service_role;

-- Rollback (Staging only, after preserving required audit evidence): revoke and drop the four A4
-- RPCs in reverse dependency order. No existing table, row, status, policy or event is changed.
