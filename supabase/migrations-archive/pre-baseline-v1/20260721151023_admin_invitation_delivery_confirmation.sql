-- A3.2 additive invitation-delivery and server-bound confirmation contracts.
-- This migration is intentionally not applied remotely by Codex.

alter table public.order_invitations
  add column if not exists previous_token_hash text,
  add column if not exists previous_token_expires_at timestamptz;

alter table public.order_invitations drop constraint if exists order_invitations_previous_token_hash_check;
alter table public.order_invitations add constraint order_invitations_previous_token_hash_check
  check (previous_token_hash is null or previous_token_hash ~ '^[a-f0-9]{64}$');
create index if not exists order_invitations_previous_token_hash_idx
  on public.order_invitations(previous_token_hash) where previous_token_hash is not null;

create or replace function public.admin_a32_preserve_previous_invitation_token() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if old.token_hash is not null and new.token_hash is distinct from old.token_hash then
    new.previous_token_hash := old.token_hash;
    new.previous_token_expires_at := old.expires_at;
  end if;
  return new;
end $$;

drop trigger if exists order_invitations_preserve_previous_token on public.order_invitations;
create trigger order_invitations_preserve_previous_token
  before update of token_hash on public.order_invitations
  for each row execute function public.admin_a32_preserve_previous_invitation_token();
revoke all on function public.admin_a32_preserve_previous_invitation_token() from public, anon, authenticated;

create or replace view public.admin_invitation_list_v1 with (security_invoker = true) as
select i.id, i.interest_request_id, i.drop_slug, i.drop_title, i.quantity, i.currency,
  i.unit_price, i.subtotal_amount, i.status, i.expires_at, i.sent_at, i.created_at, i.updated_at,
  coalesce(r.record_origin, 'customer'::public.record_origin) as record_origin,
  coalesce(r.record_origin_needs_review, true) as record_origin_needs_review,
  latest.delivery_status, latest.completed_at as delivery_completed_at
from public.order_invitations i
left join public.drop_interest_requests r on r.id = i.interest_request_id
left join lateral (
  select a.delivery_status, a.completed_at
  from public.operational_email_attempts a
  where a.template = 'order_invitation' and a.entity_type = 'order_invitation' and a.entity_id = i.id::text
  order by a.created_at desc limit 1
) latest on true;
revoke all on public.admin_invitation_list_v1 from public, anon, authenticated;
grant select on public.admin_invitation_list_v1 to service_role;

create or replace function public.admin_a32_preview_action(p_actor uuid, p_action text, p_request jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare result jsonb; r public.drop_interest_requests; invitation_count bigint; latest public.operational_email_attempts;
begin
  if p_action like 'invitation.%' and not exists (
    select 1 from public.admin_roles where user_id = p_actor and role = 'manager' and revoked_at is null
  ) then raise exception using message = 'insufficient_role', errcode = 'P0001'; end if;
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
      'maskedRecipient', case when position('@' in r.email) > 1 then left(r.email, 1) || '***@' || split_part(r.email, '@', 2) else '***' end,
      'previousDeliveryStatus', latest.delivery_status,
      'previousDeliveryCompletedAt', latest.completed_at
    ));
  end if;
  return result;
end $$;

create or replace function public.admin_a32_apply_action(
  p_actor uuid, p_action text, p_idempotency_key text, p_request_hash text,
  p_request jsonb, p_context jsonb, p_confirmation_hash text
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.drop_interest_requests; invitation_count bigint;
begin
  if p_confirmation_hash is distinct from p_request_hash or p_request_hash !~ '^[a-f0-9]{64}$' then
    raise exception using message = 'confirmation_required', errcode = 'P0001';
  end if;
  if p_action like 'invitation.%' then
    if not exists(select 1 from public.admin_roles where user_id=p_actor and role='manager' and revoked_at is null) then
      raise exception using message='insufficient_role', errcode='P0001';
    end if;
    select * into r from public.drop_interest_requests where id=(p_request->>'reservationId')::uuid for update;
    if not found then raise exception using message='not_found', errcode='P0001'; end if;
    select count(*) into invitation_count from public.order_invitations where interest_request_id=r.id;
    if invitation_count > 1 then raise exception using message='ambiguous_invitations', errcode='P0001'; end if;
    if invitation_count = 1 and exists(select 1 from public.order_invitations i where i.interest_request_id=r.id
      and coalesce(i.email_normalized,lower(i.email)) <> coalesce(r.email_normalized,lower(r.email))) then
      raise exception using message='recipient_mismatch', errcode='P0001';
    end if;
  end if;
  return public.admin_a3_apply_action(p_actor,p_action,p_idempotency_key,p_request_hash,p_request,p_context);
end $$;

create or replace function public.admin_a32_change_origin(
  p_actor uuid, p_idempotency_key text, p_request_hash text, p_reservation_id uuid,
  p_new_origin public.record_origin, p_expected_version bigint, p_reason text, p_confirmation_hash text
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_confirmation_hash is distinct from p_request_hash or p_request_hash !~ '^[a-f0-9]{64}$' then
    raise exception using message='confirmation_required', errcode='P0001';
  end if;
  return public.admin_a31_change_origin(p_actor,p_idempotency_key,p_request_hash,p_reservation_id,p_new_origin,p_expected_version,p_reason,'CONFIRM');
end $$;

create or replace function public.admin_a32_claim_delivery(p_actor uuid, p_attempt_id uuid, p_claim_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare a public.operational_email_attempts;
begin
  select * into a from public.operational_email_attempts where id=p_attempt_id;
  if not found then raise exception using message='not_found', errcode='P0001'; end if;
  if a.template='order_invitation' and not exists(select 1 from public.admin_roles where user_id=p_actor and role='manager' and revoked_at is null) then
    raise exception using message='insufficient_role', errcode='P0001';
  end if;
  if a.delivery_status='pending' and a.dispatch_started_at is not null and a.dispatch_started_at <= now() - interval '23 hours' then
    return jsonb_build_object('claimed',false,'deliveryStatus','pending','reconciliationRequired',true);
  end if;
  return public.admin_a3_claim_delivery(p_actor,p_attempt_id,p_claim_id);
end $$;

create or replace function public.admin_a32_delivery_payload(p_actor uuid, p_attempt_id uuid, p_claim_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare a public.operational_email_attempts;
begin
  select * into a from public.operational_email_attempts where id=p_attempt_id;
  if a.template='order_invitation' and not exists(select 1 from public.admin_roles where user_id=p_actor and role='manager' and revoked_at is null) then
    raise exception using message='insufficient_role', errcode='P0001';
  end if;
  return public.admin_a3_delivery_payload(p_actor,p_attempt_id,p_claim_id);
end $$;

create or replace function public.admin_a32_complete_delivery(
  p_actor uuid,p_action text,p_idempotency_key text,p_request_hash text,p_attempt_id uuid,
  p_claim_id uuid,p_delivery_status text,p_provider_id text default null
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare a public.operational_email_attempts;
begin
  select * into a from public.operational_email_attempts where id=p_attempt_id;
  if a.template='order_invitation' and not exists(select 1 from public.admin_roles where user_id=p_actor and role='manager' and revoked_at is null) then
    raise exception using message='insufficient_role', errcode='P0001';
  end if;
  if p_delivery_status='sent' and (p_provider_id is null or length(p_provider_id) > 200 or p_provider_id !~ '^[A-Za-z0-9_-]+$') then
    raise exception using message='invalid_provider_id', errcode='P0001';
  end if;
  return public.admin_a3_complete_delivery(p_actor,p_action,p_idempotency_key,p_request_hash,p_attempt_id,p_claim_id,p_delivery_status,p_provider_id);
end $$;

revoke all on function public.admin_a32_preview_action(uuid,text,jsonb) from public, anon, authenticated;
revoke all on function public.admin_a32_apply_action(uuid,text,text,text,jsonb,jsonb,text) from public, anon, authenticated;
revoke all on function public.admin_a32_change_origin(uuid,text,text,uuid,public.record_origin,bigint,text,text) from public, anon, authenticated;
revoke all on function public.admin_a32_claim_delivery(uuid,uuid,uuid) from public, anon, authenticated;
revoke all on function public.admin_a32_delivery_payload(uuid,uuid,uuid) from public, anon, authenticated;
revoke all on function public.admin_a32_complete_delivery(uuid,text,text,text,uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function public.admin_a32_preview_action(uuid,text,jsonb) to service_role;
grant execute on function public.admin_a32_apply_action(uuid,text,text,text,jsonb,jsonb,text) to service_role;
grant execute on function public.admin_a32_change_origin(uuid,text,text,uuid,public.record_origin,bigint,text,text) to service_role;
grant execute on function public.admin_a32_claim_delivery(uuid,uuid,uuid) to service_role;
grant execute on function public.admin_a32_delivery_payload(uuid,uuid,uuid) to service_role;
grant execute on function public.admin_a32_complete_delivery(uuid,text,text,text,uuid,uuid,text,text) to service_role;
