# Clean Staging runbook

This runbook records the Clean Staging operating model and transition plan. Clean Staging exists;
that fact does not authorize linking, database access, migration, Vercel configuration, provider
calls or deployment.

## Recorded status on 2026-08-01

Repository and release facts recorded for this operating-model task:

- `main`: `2027378daae5bb3f29354fcd449367ff1c648909`;
- GitHub ruleset `Protect main`: active;
- required checks: `quality-gate` and `production-dependency-audit`;
- Vercel Preview and Production: built through the existing GitHub integration;
- Production Supabase: `epqpeoubkbftcvxjbqeo`, unchanged and never a feature-test target;
- Legacy Staging: `cdmocdodehjmcgtxicaj`, inactive, frozen and not a reproducible migration
  baseline;
- Clean Staging: `stbunwkgvxfwmbjivgos`, `eu-west-1`, `ACTIVE_HEALTHY`; the canonical baseline and
  default-privilege hardening were applied under separate authorizations. Migration history,
  schema, grants, baseline contracts and default ACLs were verified.

| Component | Status |
| --- | --- |
| Production | active and unchanged |
| Legacy Staging | inactive and frozen; not a valid migration baseline |
| Clean Staging | `ACTIVE_HEALTHY`; canonical baseline and hardening applied and verified; no fixtures seeded |
| PR #18 | Draft; unchanged; rebase only after the baseline merge, with a later migration timestamp |
| A4 | frozen and outside the active release path |
| Migration-history recovery | stopped |
| WooCommerce architecture | recorded on `main` |
| Next database gate | separately authorize the version-controlled synthetic seed on exact Clean Staging |

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
- started with zero migrations and zero public tables before the completed canonical baseline gate;
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

## Disposable synthetic fixture process

Clean Staging is disposable and contains no authoritative business data. Fixture set
`PV-CLEAN-STAGING-V1` supplies fourteen deterministic Admin-review scenarios. The tooling requires
all of the following before it connects:

- `POSTER_VALLEY_ENV=clean-staging`;
- `SUPABASE_URL` for exact project `stbunwkgvxfwmbjivgos` and its server-only service-role key;
- an owner-level `psql` session identified by `PGHOST`, `PGUSER`, `PGDATABASE=postgres`,
  `PGPORT=5432` and TLS;
- explicit CLI acknowledgement `--confirm-clean-staging`.

Keep the service-role and owner credentials in the process environment or enter the database
password through the hidden prompt. Never put either value in a command argument, file or log. The
manager email is also entered through a hidden interactive prompt and is not stored in Git or the
ledger. The seed uses the Supabase Admin API to create or reuse one confirmed Auth user without
sending mail, then uses the owner session to establish exactly one active manager role and the
fixtures. During Pascal's later login, the existing login flow may send at most one Supabase Auth
login email.

```powershell
npm run staging:seed -- --confirm-clean-staging
npm run staging:verify -- --confirm-clean-staging
npm run staging:cleanup -- --confirm-clean-staging
```

The cleanup command is a dry-run unless `--confirm` is also supplied:

```powershell
npm run staging:cleanup -- --confirm-clean-staging --confirm
npm run staging:cleanup -- --confirm-clean-staging --confirm --remove-manager-role
npm run staging:cleanup -- --confirm-clean-staging --confirm --remove-manager-role --remove-manager-user
```

Manager removal is independent and explicit. `--remove-manager-user` requires
`--remove-manager-role` and performs only a Supabase soft-delete of a fixture-owned Auth user; a
reused user is never deleted. The local ledger is `.tmp/clean-staging-seed-ledger.json` and contains
only fixture/version identifiers, UUIDs, table names and timestamps.

Limited cleanup removes marked mutable reservations, invitations, orders, payments and unreferenced
delivery attempts. It never deletes `product_registry`, migration history or append-only audit,
entity and delivery events. Delivery attempts referenced by retained delivery events also remain.
Every retained row is deterministic and marked, so reseeding does not grow history without bound.

Fixtures remain available throughout Pascal's review. Operational email stays suppressed and
Mollie is never called. A full reset is deliberately not automated: pause or replace Clean Staging,
rebuild it from the two committed migrations, seed again, and relink the isolated Preview only if
the project ref changed. Never disable triggers or manually delete append-only history.

## Synthetic data standard

The seed and cleanup implementation provides:

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
unambiguously marked synthetic records; ambiguity is a stop, not permission to delete. The
version-controlled `PV-CLEAN-STAGING-V1` path now provides repeatable seed, verify and limited
cleanup commands through the scripts under [`scripts/staging`](../scripts/staging/) and the package
commands documented above. Limited cleanup intentionally retains marked append-only synthetic
history; a complete reset uses the disposable rebuild route. This tooling had not been executed
against remote Clean Staging when this documentation correction was committed.

## Clean Staging roadmap

Each external or stateful step below is a separately authorized infrastructure action.

1. Keep Draft PR #20 on the normal GitHub review path; the canonical baseline apply and its
   read-only schema, RLS, grant, payment-contract and fingerprint verification are complete.
2. Keep the verified Clean Staging history exactly equal to the canonical baseline followed by the
   allowlisted default-privilege hardening.
3. After separate authorization, run the version-controlled seed and verification, leaving the
   fixtures in place for Pascal's review.
4. Use limited cleanup after acceptance, or rebuild the disposable environment for a full reset.
5. Keep the isolated Vercel Preview on Clean Staging with suppressed/test provider configuration.
6. Rebase PR #18 after the baseline merge, assign its migration a later timestamp, and validate it
   through the same controlled path.
7. Keep inactive Legacy Staging frozen during the transition.
8. Before Production, complete the separately approved read-only cardinality check and additive
   compatibility-DDL plan; never apply the initial baseline DDL to the existing Production schema.

## Recorded creation evidence and remaining release evidence

The environment name, project ref, region and `ACTIVE_HEALTHY` status are recorded, and the
canonical baseline apply has separate verification evidence. Before the hardening apply, re-verify
the exact source commit, baseline-only remote history, dry-run scope, environment-variable scopes by
name only, provider suppression/test mode and every deferred action. After apply, record migration-
history equality, existing-object contracts, future-object default ACLs, synthetic seed/cleanup
status and Vercel Preview linkage. Never include credential values or personal data.
