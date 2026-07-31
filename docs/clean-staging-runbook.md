# Clean Staging runbook

This runbook records the intended Clean Staging operating model and transition plan. Clean Staging
does not exist yet. Nothing in this document authorizes cost, project creation, linking, database
access, migration, Vercel configuration, provider calls or deployment.

## Recorded status on 2026-07-31

Repository and release facts recorded for this operating-model task:

- `main`: `5e58e9d75c709c52473c576ca859aee6c4f9c474`;
- GitHub ruleset `Protect main`: active;
- required checks: `quality-gate` and `production-dependency-audit`;
- Vercel Preview and Production: built through the existing GitHub integration;
- Production Supabase: `epqpeoubkbftcvxjbqeo`, unchanged and never a feature-test target;
- Legacy Staging: `cdmocdodehjmcgtxicaj`, frozen and not a reproducible migration baseline;
- Clean Staging project ref: `not created yet`.

| Component | Status |
| --- | --- |
| Production | active and unchanged |
| Legacy Staging | frozen; not a valid migration baseline |
| Clean Staging | not created yet |
| PR #18 | Draft; waiting for Clean Staging validation |
| A4 | frozen and outside the active release path |
| Migration-history recovery | stopped |
| WooCommerce architecture | recorded on `main` |
| Next infrastructure step | cost confirmation and creation of Clean Staging |

### Shipping PR #18

Draft PR #18, **Add safe shipping confirmation workflow**, is on branch
`codex/shipping-confirmation` at `67742210c3036c9ed9efccedd89e0b0771ca0d40`. It is not merged.
Migration `20260729120000_shipping_confirmation_safety.sql` has not been applied permanently to any
environment. The PR remains blocked on validation against a newly created Clean Staging environment;
do not redirect that validation to Legacy Staging or Production.

### Why Legacy Staging is frozen

Legacy Staging contains remote-only history versions `20260719175848` and `20260722111632`. A prior
recovery attempt used `migration fetch` in a temporary verification worktree, overwrote tracked
migration files there, and produced an A4 migration that did not exactly match a known Git version.
The fetched/recovery files are not a source of truth, and recovery is stopped.

Do not use migration-history repair, `db pull`, placeholder migrations or manual migration-table
changes to make Legacy Staging appear aligned. Do not deploy any new feature migration there. Keep
the environment intact and frozen until a separate post-transition archive/removal decision.

## Clean Staging target contract

Clean Staging is a separate Supabase environment that:

- is created only after Pascal explicitly confirms current organization cost and the bounded
  infrastructure action;
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

1. Request the Supabase organization context and current cost.
2. Pascal explicitly confirms the cost.
3. Create the Clean Staging project in an appropriate EU region.
4. Record the project ref safely in environment documentation without exposing secrets.
5. Link it only from a dedicated infrastructure worktree after exact target verification.
6. Apply migrations from `main` in their committed order.
7. Prove exact migration-history equality between `main` and Clean Staging.
8. Add the repeatable synthetic seed and cleanup mechanism in a separate repository change.
9. Switch Vercel Preview to Clean Staging with suppressed/test provider configuration.
10. Migrate and test PR #18 against Clean Staging, including its controlled-path evidence.
11. Keep Legacy Staging frozen during the transition.
12. After successful transition, make a separate decision to archive or remove Legacy Staging.

## Completion evidence for environment creation

The infrastructure task is not complete until its report records the organization/region, approved
cost, new project ref, source `main` SHA, applied migration versions, exact history-equality result,
environment-variable scopes by name only, provider suppression/test mode, synthetic seed/cleanup
status, Vercel Preview linkage status and every deferred action. Never include credential values or
personal data.
