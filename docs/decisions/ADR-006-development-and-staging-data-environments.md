# ADR-006: Development and staging data environments

**Status:** Accepted — implementation and production release require separate approval.

## Decision

Admin Dashboard development, authentication, RLS work, migrations and operational tests must not run against Production Supabase. The safest practical default is a separate **Poster Valley Kickoff Staging** Supabase project. Vercel Preview uses staging variables; Vercel Production continues to use Production variables. Codex Cloud routine development receives no Production service-role key. Migrations run on staging first; a production migration is a separate, human-approved release action.

Staging must not send real customer email or create live Mollie payments. Test rows must be identifiable (for example, a non-production marker), removable, and never copied from production customer data. Every migration needs a forward migration, rollback notes, RLS review, backward/forward compatibility checks and staging evidence.

## Alternatives evaluated

A separate staging project offers durable isolation, Preview compatibility and realistic Supabase Auth/RLS validation. Local or ephemeral Supabase via Supabase CLI can supplement unit/integration tests, but this repository contains no CLI configuration or Cloud evidence proving Docker/CLI reliability. It is therefore optional, not the required default for Codex Cloud. No project, variable or environment is created by this ADR.
