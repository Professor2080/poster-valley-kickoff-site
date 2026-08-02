-- Keep future objects in the exposed public schema deny-by-default. Existing object ACLs are
-- intentionally untouched; every later migration must grant only its explicitly reviewed surface.
alter default privileges for role postgres in schema public
  revoke select, insert, update, delete on tables
  from public, anon, authenticated, service_role;

-- Supabase's hosted defaults also include the remaining PostgreSQL 17 table privileges.
alter default privileges for role postgres in schema public
  revoke truncate, references, trigger, maintain on tables
  from public, anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke execute on functions
  from anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke usage, select, update on sequences
  from public, anon, authenticated, service_role;

-- PostgreSQL's built-in PUBLIC EXECUTE default is global. A schema-scoped revoke cannot remove it.
alter default privileges for role postgres
  revoke execute on functions
  from public;
