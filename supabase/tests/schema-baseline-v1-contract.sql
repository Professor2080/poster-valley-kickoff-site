\set ON_ERROR_STOP on

create function pg_temp.assert_true(result boolean, contract text)
returns void
language plpgsql
as $$
begin
  if result is distinct from true then
    raise exception 'schema baseline contract failed: %', contract;
  end if;
end;
$$;

select pg_temp.assert_true(
  (select count(*) = 13 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r'),
  '13 public tables'
);
select pg_temp.assert_true(
  (select count(*) = 4 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'v'),
  '4 public views'
);
select pg_temp.assert_true(
  (select count(*) = 2 from pg_catalog.pg_type t join pg_catalog.pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public' and t.typtype = 'e'),
  '2 public enums'
);
select pg_temp.assert_true(
  (select count(*) = 28 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'),
  '28 public routines'
);
select pg_temp.assert_true(
  (select count(*) = 9 from pg_catalog.pg_trigger t join pg_catalog.pg_class c on c.oid = t.tgrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and not t.tgisinternal),
  '9 application triggers'
);
select pg_temp.assert_true(
  (select count(*) = 2 from pg_catalog.pg_policy p join pg_catalog.pg_class c on c.oid = p.polrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public'),
  '2 RLS policies'
);
select pg_temp.assert_true(
  (select count(*) = 57 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'i'),
  '57 indexes'
);
select pg_temp.assert_true(
  (select count(*) = 77 from pg_catalog.pg_constraint c join pg_catalog.pg_namespace n on n.oid = c.connamespace where n.nspname = 'public'),
  '77 constraints'
);

select pg_temp.assert_true(
  (select count(*) = 13 and bool_and(c.relrowsecurity) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r'),
  'RLS on all 13 tables'
);
select pg_temp.assert_true(
  (select count(*) = 4 and bool_and(coalesce(c.reloptions @> array['security_invoker=true'], false)) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'v'),
  'security_invoker on all 4 views'
);

select pg_temp.assert_true(
  not exists (
    select 1 from pg_catalog.pg_namespace n
    cross join lateral pg_catalog.aclexplode(n.nspacl) a
    where n.nspname = 'public' and a.grantee = 0
    union all
    select 1 from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    cross join lateral pg_catalog.aclexplode(c.relacl) a
    where n.nspname = 'public' and c.relkind in ('r', 'v', 'S') and a.grantee = 0
    union all
    select 1 from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    cross join lateral pg_catalog.aclexplode(p.proacl) a
    where n.nspname = 'public' and a.grantee = 0
  ),
  'no PUBLIC privileges on the public application surface'
);

select pg_temp.assert_true(
  not pg_catalog.has_schema_privilege('anon', 'public', 'usage')
  and not exists (
    select 1 from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'v', 'S')
      and (pg_catalog.has_any_column_privilege('anon', c.oid, 'select,insert,update,references')
        or pg_catalog.has_table_privilege('anon', c.oid, 'delete,truncate,trigger'))
  )
  and not exists (
    select 1 from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and pg_catalog.has_function_privilege('anon', p.oid, 'execute')
  ),
  'anon has no schema, relation, or routine access'
);

select pg_temp.assert_true(
  pg_catalog.has_schema_privilege('authenticated', 'public', 'usage')
  and not pg_catalog.has_schema_privilege('authenticated', 'public', 'create')
  and (
    with actual as (
      select c.relname, a.privilege_type
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      cross join lateral pg_catalog.aclexplode(c.relacl) a
      where n.nspname = 'public' and a.grantee = 'authenticated'::regrole
    ), expected(relname, privilege_type) as (
      values ('admin_roles', 'SELECT'), ('product_registry', 'SELECT')
    )
    select not exists ((select * from actual except select * from expected) union all (select * from expected except select * from actual))
  )
  and not exists (
    select 1 from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and pg_catalog.has_function_privilege('authenticated', p.oid, 'execute')
  ),
  'authenticated has only schema usage and the two accepted SELECT grants'
);

select pg_temp.assert_true(
  pg_catalog.has_schema_privilege('service_role', 'public', 'usage')
  and not pg_catalog.has_schema_privilege('service_role', 'public', 'create')
  and (
    with actual as (
      select c.relname, a.privilege_type
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      cross join lateral pg_catalog.aclexplode(c.relacl) a
      where n.nspname = 'public' and a.grantee = 'service_role'::regrole
    ), expected(relname, privilege_type) as (
      values
        ('admin_audit_events', 'SELECT'),
        ('admin_invitation_list_v1', 'SELECT'),
        ('admin_order_list_v1', 'SELECT'),
        ('admin_payment_list_v1', 'SELECT'),
        ('admin_reservation_list_v1', 'SELECT'),
        ('admin_roles', 'SELECT'),
        ('drop_interest_requests', 'INSERT'),
        ('drop_interest_requests', 'SELECT'),
        ('email_delivery_events', 'SELECT'),
        ('entity_events', 'SELECT'),
        ('manual_shipping_quotes', 'SELECT'),
        ('newsletter_signups', 'INSERT'),
        ('operational_email_attempts', 'SELECT'),
        ('order_invitations', 'SELECT'),
        ('order_invitations', 'UPDATE'),
        ('orders', 'INSERT'),
        ('orders', 'SELECT'),
        ('orders', 'UPDATE'),
        ('payments', 'INSERT'),
        ('payments', 'SELECT'),
        ('payments', 'UPDATE'),
        ('product_registry', 'SELECT')
    )
    select not exists ((select * from actual except select * from expected) union all (select * from expected except select * from actual))
  ),
  'service_role has exactly the approved relation privileges'
);

select pg_temp.assert_true(
  (
    with actual as (
      select p.proname
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and pg_catalog.has_function_privilege('service_role', p.oid, 'execute')
    ), expected(proname) as (
      values
        ('admin_a31_assert_shipping_ready'),
        ('admin_a31_change_origin'),
        ('admin_a31_preview_origin_change'),
        ('admin_a32_apply_action'),
        ('admin_a32_change_origin'),
        ('admin_a32_claim_delivery'),
        ('admin_a32_complete_delivery'),
        ('admin_a32_delivery_payload'),
        ('admin_a32_preview_action'),
        ('admin_a3_apply_action'),
        ('admin_a3_claim_delivery'),
        ('admin_a3_complete_delivery'),
        ('admin_a3_delivery_payload'),
        ('admin_a3_preview_action'),
        ('admin_a3_replay_action'),
        ('payment_start_begin_provider'),
        ('payment_start_claim'),
        ('payment_start_complete'),
        ('payment_start_mark_reconciliation')
    )
    select not exists ((select * from actual except select * from expected) union all (select * from expected except select * from actual))
  ),
  'service_role has exactly 19 approved RPC execute grants'
);

select pg_temp.assert_true(
  (select count(*) = 20 and bool_and(p.prosecdef) and bool_and(
    p.proconfig is not null
    and exists (select 1 from unnest(p.proconfig) setting where setting like 'search_path=%')
    and not exists (select 1 from unnest(p.proconfig) setting where setting ~ '(^|,)extensions(,|$)')
  ) from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prosecdef),
  'all 20 SECURITY DEFINER routines have a fixed restricted search_path'
);
select pg_temp.assert_true(
  (select count(*) = 8 and bool_and(
    not pg_catalog.has_function_privilege('service_role', p.oid, 'execute')
    and not pg_catalog.has_function_privilege('authenticated', p.oid, 'execute')
    and not pg_catalog.has_function_privilege('anon', p.oid, 'execute')
  ) from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and not p.prosecdef),
  'all 8 trigger/helper routines remain internal'
);

select pg_temp.assert_true(
  (select count(*) = 3 from pg_catalog.pg_constraint where connamespace = 'public'::regnamespace and conname in ('orders_invitation_id_key', 'payments_order_id_provider_key', 'orders_payment_provider_idempotency_key_key') and contype = 'u'),
  'one canonical order, one provider payment, and one provider idempotency key'
);
select pg_temp.assert_true(
  (select count(*) = 4 and bool_and(p.prosecdef) and bool_and(
    pg_catalog.has_function_privilege('service_role', p.oid, 'execute')
    and not pg_catalog.has_function_privilege('authenticated', p.oid, 'execute')
    and not pg_catalog.has_function_privilege('anon', p.oid, 'execute')
  ) from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'payment_start_%'),
  'four payment-start RPCs are service_role-only SECURITY DEFINER routines'
);
select pg_temp.assert_true(
  (select count(*) = 3 from pg_catalog.pg_trigger where not tgisinternal and tgname in ('admin_audit_events_no_update', 'email_delivery_events_no_update', 'entity_events_no_update')),
  'all protected-history triggers exist'
);
select pg_temp.assert_true(
  (select count(*) = 1 from pg_catalog.pg_trigger where not tgisinternal and tgname = 'product_registry_code_immutable'),
  'product_code immutability trigger exists'
);

select pg_temp.assert_true(
  (select count(*) = 1 and min(product_code) = 'eurofighter-typhoon-a2' and min(lifecycle_mode) = 'interest' and min(commerce_authority) = 'custom' from public.product_registry),
  'exactly one canonical product configuration row'
);
select pg_temp.assert_true(
  (select
    (select count(*) from public.admin_audit_events)
    + (select count(*) from public.admin_operation_idempotency)
    + (select count(*) from public.admin_roles)
    + (select count(*) from public.drop_interest_requests)
    + (select count(*) from public.email_delivery_events)
    + (select count(*) from public.entity_events)
    + (select count(*) from public.manual_shipping_quotes)
    + (select count(*) from public.newsletter_signups)
    + (select count(*) from public.operational_email_attempts)
    + (select count(*) from public.order_invitations)
    + (select count(*) from public.orders)
    + (select count(*) from public.payments)
  ) = 0,
  'zero non-configuration application rows'
);

begin;
insert into public.admin_audit_events (action, entity_type, entity_id)
values ('fixture.created', 'fixture', 'history-contract');
do $$
begin
  begin
    update public.admin_audit_events set action = 'fixture.changed' where entity_id = 'history-contract';
    raise exception 'protected-history update unexpectedly succeeded';
  exception when others then
    if sqlerrm <> 'protected history is append-only' then raise; end if;
  end;
  begin
    delete from public.admin_audit_events where entity_id = 'history-contract';
    raise exception 'protected-history delete unexpectedly succeeded';
  exception when others then
    if sqlerrm <> 'protected history is append-only' then raise; end if;
  end;
  begin
    update public.product_registry set product_code = 'changed-code' where product_code = 'eurofighter-typhoon-a2';
    raise exception 'product_code mutation unexpectedly succeeded';
  exception when others then
    if sqlerrm <> 'product_code is immutable' then raise; end if;
  end;
end;
$$;
rollback;

select pg_temp.assert_true(
  not exists (
    select 1
    from pg_catalog.pg_default_acl d
    join pg_catalog.pg_namespace n on n.oid = d.defaclnamespace
    cross join lateral pg_catalog.aclexplode(d.defaclacl) a
    where d.defaclrole = 'postgres'::regrole
      and n.nspname = 'public'
      and d.defaclobjtype = 'r'
      and a.grantee in (0, 'anon'::regrole, 'authenticated'::regrole, 'service_role'::regrole)
  ),
  'future public tables have no default grants for PUBLIC or Data API roles'
);
select pg_temp.assert_true(
  not exists (
    select 1
    from pg_catalog.pg_default_acl d
    left join pg_catalog.pg_namespace n on n.oid = d.defaclnamespace
    cross join lateral pg_catalog.aclexplode(d.defaclacl) a
    where d.defaclrole = 'postgres'::regrole
      and (d.defaclnamespace = 0 or n.nspname = 'public')
      and d.defaclobjtype = 'f'
      and a.grantee in (0, 'anon'::regrole, 'authenticated'::regrole, 'service_role'::regrole)
  ),
  'future functions have no default EXECUTE for PUBLIC or Data API roles'
);
select pg_temp.assert_true(
  not exists (
    select 1
    from pg_catalog.pg_default_acl d
    join pg_catalog.pg_namespace n on n.oid = d.defaclnamespace
    cross join lateral pg_catalog.aclexplode(d.defaclacl) a
    where d.defaclrole = 'postgres'::regrole
      and n.nspname = 'public'
      and d.defaclobjtype = 'S'
      and a.grantee in (0, 'anon'::regrole, 'authenticated'::regrole, 'service_role'::regrole)
  ),
  'future public sequences have no default grants for PUBLIC or Data API roles'
);

begin;
create table public.pv_default_acl_table_contract (id bigint primary key);
create function public.pv_default_acl_function_contract()
returns integer
language sql
as 'select 1';
create sequence public.pv_default_acl_sequence_contract;

select pg_temp.assert_true(
  not exists (
    select 1
    from pg_catalog.pg_class c
    cross join lateral pg_catalog.aclexplode(c.relacl) a
    where c.oid = 'public.pv_default_acl_table_contract'::regclass and a.grantee = 0
  )
  and not pg_catalog.has_table_privilege('anon', 'public.pv_default_acl_table_contract', 'select,insert,update,delete,truncate,references,trigger,maintain')
  and not pg_catalog.has_table_privilege('authenticated', 'public.pv_default_acl_table_contract', 'select,insert,update,delete,truncate,references,trigger,maintain')
  and not pg_catalog.has_table_privilege('service_role', 'public.pv_default_acl_table_contract', 'select,insert,update,delete,truncate,references,trigger,maintain'),
  'new public table is deny-by-default'
);
select pg_temp.assert_true(
  not exists (
    select 1
    from pg_catalog.pg_proc p
    cross join lateral pg_catalog.aclexplode(p.proacl) a
    where p.oid = 'public.pv_default_acl_function_contract()'::regprocedure and a.grantee = 0
  )
  and not pg_catalog.has_function_privilege('anon', 'public.pv_default_acl_function_contract()', 'execute')
  and not pg_catalog.has_function_privilege('authenticated', 'public.pv_default_acl_function_contract()', 'execute')
  and not pg_catalog.has_function_privilege('service_role', 'public.pv_default_acl_function_contract()', 'execute'),
  'new public function is deny-by-default'
);
select pg_temp.assert_true(
  not exists (
    select 1
    from pg_catalog.pg_class c
    cross join lateral pg_catalog.aclexplode(c.relacl) a
    where c.oid = 'public.pv_default_acl_sequence_contract'::regclass and a.grantee = 0
  )
  and not pg_catalog.has_sequence_privilege('anon', 'public.pv_default_acl_sequence_contract', 'usage,select,update')
  and not pg_catalog.has_sequence_privilege('authenticated', 'public.pv_default_acl_sequence_contract', 'usage,select,update')
  and not pg_catalog.has_sequence_privilege('service_role', 'public.pv_default_acl_sequence_contract', 'usage,select,update'),
  'new public sequence is deny-by-default'
);

grant select on table public.pv_default_acl_table_contract to service_role;
select pg_temp.assert_true(
  pg_catalog.has_table_privilege('service_role', 'public.pv_default_acl_table_contract', 'select')
  and not pg_catalog.has_table_privilege('service_role', 'public.pv_default_acl_table_contract', 'insert,update,delete,truncate,references,trigger,maintain'),
  'explicit later service_role grant remains possible and narrowly scoped'
);
rollback;
