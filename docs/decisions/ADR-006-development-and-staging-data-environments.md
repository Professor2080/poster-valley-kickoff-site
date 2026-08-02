# ADR-006: Development and staging data environments

**Status:** Accepted — operational clarification recorded 2026-07-31; implementation and
production release require separate approval.

## Decision

Admin Dashboard development, authentication, RLS work, migrations and operational tests must not
run against Production Supabase. The practical default is **Clean Staging**: a separate, disposable
Poster Valley Kickoff Supabase project built solely from committed migrations on `main`. Vercel
Preview uses Clean Staging variables; Vercel Production continues to use Production variables.
Routine development receives no Production service-role key. Migrations run on Clean Staging first;
a Production migration is a separate, human-approved release action.

The existing project `cdmocdodehjmcgtxicaj` is now **Legacy Staging**: a frozen legacy environment,
not a valid migration baseline. Clean Staging has not yet been created and requires separate cost
and infrastructure approval. See the [environment matrix](../environment-matrix.md) and
[Clean Staging runbook](../clean-staging-runbook.md).

Clean Staging must not send real customer email or create live Mollie payments. Test rows must be
synthetic, identifiable, removable and never copied from Production customer data. Every migration
needs an additive forward change, rollback or forward-fix notes, RLS/grant review,
backward/forward-compatibility checks and Clean Staging evidence.

## Alternatives evaluated

A separate staging project offers durable isolation, Preview compatibility and realistic Supabase Auth/RLS validation. Local or ephemeral Supabase via Supabase CLI can supplement unit/integration tests, but this repository contains no CLI configuration or Cloud evidence proving Docker/CLI reliability. It is therefore optional, not the required default for Codex Cloud. No project, variable or environment is created by this ADR.
