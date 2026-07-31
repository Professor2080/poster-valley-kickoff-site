# Clean Staging runbook

This runbook records the Clean Staging operating model and transition plan. Clean Staging exists;
that fact does not authorize linking, database access, migration, Vercel configuration, provider
calls or deployment.

## Recorded status on 2026-07-31

Repository and release facts recorded for this operating-model task:

- `main`: `2027378daae5bb3f29354fcd449367ff1c648909`;
- GitHub ruleset `Protect main`: active;
- required checks: `quality-gate` and `production-dependency-audit`;
- Vercel Preview and Production: built through the existing GitHub integration;
- Production Supabase: `epqpeoubkbftcvxjbqeo`, unchanged and never a feature-test target;
- Legacy Staging: `cdmocdodehjmcgtxicaj`, inactive, frozen and not a reproducible migration
  baseline;
- Clean Staging: `stbunwkgvxfwmbjivgos`, `eu-west-1`, supplied as `ACTIVE_HEALTHY`, with zero
  migrations and zero public tables. This repository task did not connect to or independently
  re-query the project.

| Component | Status |
| --- | --- |
| Production | active and unchanged |
| Legacy Staging | inactive and frozen; not a valid migration baseline |
| Clean Staging | `ACTIVE_HEALTHY`; empty; not accessed by the baseline-promotion task |
| PR #18 | Draft; unchanged; rebase only after the baseline merge, with a later migration timestamp |
| A4 | frozen and outside the active release path |
| Migration-history recovery | stopped |
| WooCommerce architecture | recorded on `main` |
| Next database gate | separately authorize and apply the merged canonical baseline to empty Clean Staging |

### Shipping PR #18

Draft PR #18, **Add safe shipping confirmation workflow**, is on branch
`codex/shipping-confirmation` at `67742210c3036c9ed9efccedd89e0b0771ca0d40`. It is not merged.
Migration `20260729120000_shipping_confirmation_safety.sql` has not been applied permanently to any
environment. The PR remains unchanged. After the canonical baseline merges, rebase PR #18 and give
its migration a later timestamp before separately authorized Clean Staging validation; do not
redirect that validation to Legacy Staging or Production.

### Why Legacy Staging is frozen

Legacy Staging contains remote-only history versions `20260719175848` and `20260722111632`. A prior
recovery attempt used `migration fetch` in a temporary verification worktree, overwrote tracked
migration files there, and produced an A4 migration that did not exactly match a known Git version.
The fetched/recovery files are not a source of truth, and recovery is stopped.

Do not use migration-history repair, `db pull`, placeholder migrations or manual migration-table
changes to make Legacy Staging appear aligned. Do not access it or deploy any new feature migration
there. Keep the environment inactive and frozen until a separate post-transition archive/removal
decision.

## Clean Staging target contract

Clean Staging is a separate Supabase environment that:

- has project ref `stbunwkgvxfwmbjivgos` in `eu-west-1` and was recorded as `ACTIVE_HEALTHY`;
- starts with zero migrations and zero public tables before the canonical baseline gate;
- is built solely by applying committed migrations from `main` in order;
- is disposable and fully rebuildable from that history plus an approved synthetic seed process;
- contains no Production copy, customer record, real address or other real personal data;
- is the only database target for separately approved migration, concurrency, idempotency,
  transaction and authenticated Vercel Preview validation;
- uses only non-production secrets, suppressed Resend delivery and Mollie test mode;
- can be destroyed/rebuilt without losing authoritative business or migration history.

The migration authority and entry gate are defined in the
[database release process](database-release-process.md). The exact environment separation is in the
[environment matrix](environment-matrix.md).

## Synthetic data standard

The future seed and cleanup design must provide:

- fixed synthetic administrator accounts with documented roles;
- fixed test SKUs;
- fixed reservation, invitation, payment and fulfilment scenarios, including negative,
  concurrency and idempotency cases;
- email addresses under an explicit reserved test domain such as `.test`, or another provider-safe
  test form;
- invented names and addresses only; never Production-derived or plausible customer fixtures;
- no real payment-provider calls; Mollie remains in verified test mode;
- Resend delivery suppressed by default;
- recognizable constrained `record_origin` values such as `test` or `internal_pilot`, applied only
  through trusted server/test paths;
- a repeatable, version-controlled seed process;
- a repeatable cleanup process with before/after counts and failure reporting;
- permission to rebuild Clean Staging completely from committed migrations and synthetic seed data.

Public submissions must never be able to choose a trusted record origin. Cleanup operates only on
unambiguously marked synthetic records; ambiguity is a stop, not permission to delete. This task
defines the process only and intentionally creates no seed file or data.

## Clean Staging roadmap

Each external or stateful step below is a separately authorized infrastructure action.

1. Merge the reviewed canonical baseline through the normal GitHub release path.
2. Under separate authorization, verify the exact Clean Staging project, empty history and empty
   public schema, then require the dry-run to contain only `20260731113000_schema_baseline_v1.sql`.
3. Apply that baseline to Clean Staging and verify schema, RLS, grants, payment contracts and the
   two canonical fingerprints.
4. Add the repeatable synthetic seed and cleanup mechanism in a separate repository change.
5. Switch an isolated Vercel Preview to Clean Staging with suppressed/test provider configuration.
6. Rebase PR #18 after the baseline merge, assign its migration a later timestamp, and validate it
   through the same controlled path.
7. Keep inactive Legacy Staging frozen during the transition.
8. Before Production, complete the separately approved read-only cardinality check and additive
   compatibility-DDL plan; never apply the initial baseline DDL to the existing Production schema.

## Recorded creation evidence and remaining release evidence

This task was supplied the environment name, project ref, region, `ACTIVE_HEALTHY` status, zero
migrations and zero public tables. It did not access the project or inspect credentials. Before the
first baseline apply, re-verify those facts, the exact source `main` SHA, dry-run scope,
environment-variable scopes by name only, provider suppression/test mode and every deferred action.
After apply, record migration-history equality, schema contracts, synthetic seed/cleanup status and
Vercel Preview linkage. Never include credential values or personal data.
