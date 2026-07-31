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
