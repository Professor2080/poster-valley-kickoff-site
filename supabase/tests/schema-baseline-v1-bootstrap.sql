\set ON_ERROR_STOP on

-- Minimal local-only Supabase compatibility surface. The orchestrator creates the three cluster
-- roles once before creating each database from template0.
create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid()
returns uuid
language sql
stable
set search_path = ''
as 'select null::uuid';

create schema extensions;
create extension pgcrypto with schema extensions;
create extension "uuid-ossp" with schema extensions;

-- Reproduce the hosted Supabase default ACLs that existed on Clean Staging before hardening.
-- The baseline revokes these grants from its own objects; the post-baseline migration must also
-- remove them for every future object created by postgres in public.
alter default privileges for role postgres in schema public
  grant all privileges on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant execute on functions to anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant all privileges on sequences to anon, authenticated, service_role;
