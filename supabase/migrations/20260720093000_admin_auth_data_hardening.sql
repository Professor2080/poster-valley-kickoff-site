-- A1 hardening follow-up. The preceding foundation migration is immutable history.
-- Apply only after review, and only to the confirmed staging project first.
alter function public.prevent_protected_history_mutation() set search_path = '';
alter function public.prevent_product_code_change() set search_path = '';

drop policy if exists admin_roles_read_own on public.admin_roles;
create policy admin_roles_read_own on public.admin_roles for select to authenticated
  using (user_id = (select auth.uid()) and revoked_at is null);

create index if not exists admin_roles_granted_by_idx
  on public.admin_roles (granted_by)
  where granted_by is not null;
