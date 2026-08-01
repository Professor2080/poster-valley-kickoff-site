# Database release process

This document is the authoritative Poster Valley database-history and database-release policy. It
does not authorize a project connection, SQL execution, migration, environment change or release.
Environment identities and provider boundaries are in the [environment matrix](environment-matrix.md).

## One authoritative history

- Committed files in `supabase/migrations/` on `main` are the only authoritative migration history.
- After a migration is applied to any persistent environment, its file is immutable. Corrections
  are additive migrations, never edits to the applied file.
- Every active Staging and Production environment must be reproducible by applying this committed
  history in order.
- A version that exists only in a remote migration-history table is an infrastructure blocker. The
  affected environment is not a release baseline.
- Remote-only history is handled in a separately authorized infrastructure task, never while
  implementing or releasing a product feature.

`migration repair`, `db pull`, `migration fetch`, placeholder migrations and direct changes to
`supabase_migrations.schema_migrations` are not normal release tools. They must not be used to make
an environment look aligned with Git. If exceptional recovery is ever proposed, it requires a
separate recovery plan, preserved evidence, exact provenance, independent review and explicit
approval; the resulting files are not authoritative until their contents and history are reconciled
through an approved repository change.

## Schema Baseline v1 promotion status

- `supabase/migrations/20260731113000_schema_baseline_v1.sql` is the immutable first active
  migration and has been proven twice from `template0` on PostgreSQL 17.
- `supabase/migrations/20260731193947_harden_default_privileges.sql` is the exact allowlisted first
  post-baseline migration. It revokes implicit default privileges for future `public` tables,
  functions and sequences; later migrations must grant only their explicitly reviewed surface.
- The six pre-baseline-generation migrations are preserved byte-for-byte under
  `supabase/migrations-archive/pre-baseline-v1/`; their manifest is provenance, never active CLI
  input.
- The payment-start idempotency finding is repaired locally through one canonical order per
  invitation, one payment per order/provider, atomic server-only RPCs and persistent Mollie keys.
- Clean Staging `stbunwkgvxfwmbjivgos` is `ACTIVE_HEALTHY`; the canonical baseline was applied there
  under separate authorization and its migration history, schema, grants and contracts were
  verified. This hardening task performs no remote database write.
- The next separately authorized database gate is to require exact pre-feature history containing
  only the canonical baseline, dry-run only the allowlisted hardening migration, apply it, and
  verify the new default-ACL contracts before Preview validation.
- Before Production, perform a separately authorized read-only cardinality check and approve the
  additive compatibility DDL. The baseline file itself must never be run against the existing
  Production schema.
- Legacy Staging `cdmocdodehjmcgtxicaj` remains inactive and is not a release target.

## Feature-migration entry gate

Before applying any feature migration to a persistent target:

1. Verify the exact repository, active worktree, branch, candidate commit and target project ref.
2. Verify that the candidate starts from the intended, current `main` baseline.
3. Compare committed migration versions with the target's migration list.
4. Prove that the local/committed and remote lists are exactly equal **before** the feature version.
5. Stop on any missing, extra, renamed, reordered or remote-only version. Move that finding to an
   infrastructure task.
6. Run a dry-run against the verified target and require it to list only the intended feature
   migration or explicitly approved migration set.
7. Stop if the dry-run is empty unexpectedly, ambiguous, or includes any unrelated migration.

Passing this gate proves only history alignment and intended scope. Applying a migration still
requires separate environment-specific approval.

## Migration design requirements

Every migration change must be deterministic, reviewable and safe in its intended order. Record:

- forward behavior and affected objects;
- backward and forward application compatibility;
- RLS, grants, function execution privileges and restricted `SECURITY DEFINER` `search_path`;
- constraints, indexes and critical data invariants;
- backfill or data-transition behavior, including idempotency and transaction boundaries;
- rollback limits and a forward-fix plan;
- synthetic verification and cleanup steps.

Add SQL-contract regression tests for permissions, RLS, function configuration, indexes,
constraints and other critical invariants. Never expose service-role credentials, raw invitation
tokens, personal data or privileged RPC execution to public clients.

Default privileges and existing-object privileges are separate controls. Keep future objects in
the exposed `public` schema deny-by-default for `PUBLIC`, `anon`, `authenticated` and
`service_role`; every later migration must add only narrow, reviewed grants and must still configure
RLS where a Data API role receives table access.

## Database-first release for additive changes

For an additive, backward-compatible migration:

1. Test the migration locally using the repository's approved local workflow.
2. Pass the feature-migration entry gate for Clean Staging.
3. Apply the migration to Clean Staging under separate authorization.
4. Confirm that the currently deployed application still works against the expanded schema.
5. Run synthetic migration, concurrency, idempotency and transaction scenarios plus the
   authenticated Vercel Preview flow.
6. Remove synthetic records and retain cleanup evidence.
7. Before Production, record the bounded rollback or forward-fix plan.
8. Re-run the entry gate for the exact Production target and candidate migration.
9. Obtain separate Production-migration approval and apply the migration.
10. Merge/deploy the application only after the database step succeeds.
11. Verify Production read-only for the intended schema/application outcome; do not create real
    email, payment or customer-data effects without additional approval.

The application merge, Production migration and any external-effect smoke test are separate approval
gates. A successful Clean Staging migration authorizes none of them.

## Contract-breaking changes

Contract-breaking database work must use:

`expand -> migrate -> contract`

1. **Expand:** add the new compatible shape without removing the old one.
2. **Migrate:** move callers/data in independently releasable steps while old and new code can
   coexist.
3. **Contract:** remove the obsolete shape only after evidence shows that no deployed caller uses
   it, in a later separately approved release.

Do not remove or rename a used column, table, view, function, RPC or status contract in the same
release that introduces its first replacement caller.

## Required release evidence

The final report for a migration-bearing controlled change records:

- baseline and candidate Git SHAs;
- exact target project ref;
- migration version(s);
- pre-feature migration-list equality evidence;
- dry-run scope;
- schema, RLS, grant and RPC contract results;
- concurrency, idempotency, transaction and authenticated Preview results;
- provider modes and suppressed effects;
- synthetic-data cleanup status;
- rollback/forward-fix plan and every approval not yet granted.

The [release runbook](release-runbook.md) owns the full Definition of Done. The
[Clean Staging runbook](clean-staging-runbook.md) owns environment creation, synthetic-data standards
and the current transition roadmap.
