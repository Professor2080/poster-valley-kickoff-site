# Clean Staging runbook

This runbook records the Clean Staging operating model and transition plan. Clean Staging exists;
that fact does not authorize linking, database access, migration, Vercel configuration, provider
calls or deployment.

The interactive local Codex credential route is frozen and must not be used, repaired or extended.
Migration planning and application belong only to the protected, manual GitHub Actions boundary
defined in [Clean Staging database delivery](clean-staging-ci-delivery.md). That workflow remains
inactive until its Draft PR is reviewed and merged, the protected GitHub environment is configured,
and the exact plan or apply run is separately authorized.

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
| Clean Staging | `ACTIVE_HEALTHY`; canonical baseline and hardening applied and verified; `PV-CLEAN-STAGING-V1` fixtures present |
| PR #18 | Draft; current `main` merged normally; later-timestamp migration awaiting separate validation |
| A4 | frozen and outside the active release path |
| Migration-history recovery | stopped |
| WooCommerce architecture | recorded on `main` |
| Next database gate | separately authorize the version-controlled synthetic seed on exact Clean Staging |

### Shipping PR #18

Draft PR #18, **Add safe shipping confirmation workflow**, is on branch
`codex/shipping-confirmation` at `67742210c3036c9ed9efccedd89e0b0771ca0d40`. It is not merged.
Migration `20260802130000_shipping_confirmation_safety.sql` has not been applied permanently to any
environment. Current `main` was merged normally into PR #18 and the migration now sorts after the
canonical baseline and default-privilege hardening. Clean Staging validation still requires separate
authorization; do not redirect that validation to Legacy Staging or Production.

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
`PV-CLEAN-STAGING-V1` supplies sixteen deterministic Admin-review scenarios. The two Order Flow
additions show a reached-threshold unsent Interest card and a failed invitation that remains
retryable in Interest. The tooling requires
all of the following before it connects:

- `POSTER_VALLEY_ENV=clean-staging`;
- `SUPABASE_URL` for exact project `stbunwkgvxfwmbjivgos`;
- an authenticated project-local Supabase CLI whose checked link in
  `supabase/.temp/project-ref` is exactly `stbunwkgvxfwmbjivgos`;
- explicit CLI acknowledgement `--confirm-clean-staging`.

The database path is the official `supabase db query --linked` Management API route. It does not
use the Direct, Shared Session or Transaction Pooler and does not require a database password or
connection URL. Before Auth access or a database write, a read-only transaction proves database
`postgres`, both session and current user `postgres`, owner table privileges, enabled append-only
triggers and exactly the six allowlisted migrations. The project link is checked again for every
query. SQL is supplied through a unique operating-system temporary file outside the repository;
that file never contains credentials and is removed in `finally`. The child process receives only
the operating-system variables needed for the authenticated CLI profile. Service-role, provider,
database and access-token variables are not forwarded and CLI failures expose no provider output.

The seed and cleanup SQL retain their explicit `begin`/`commit`, lock timeouts, table locks and
fail-closed fixture guards. The read-only owner gate itself runs as a multi-statement
`begin read only`/`rollback` query, proving that the linked route preserves the transaction boundary
used by those operations. Therefore port 5432 is not required for this acceptance chain, while
port 6543 is neither used nor accepted as a fallback. The normal seed, verify and limited-cleanup
path needs no service-role value: the owner gate reads only the UUID, confirmation flag and
fixture-owned marker of Auth identities and requires exactly one active confirmed fixture user
before continuing. It never reads or prints the Auth email and never creates an Auth identity.
Create that fixture-owned login separately before the seed if it is absent. A service-role value is
required only for the separately explicit `--remove-manager-user` soft-delete option and remains in
the parent process; it is never forwarded to the database CLI. During Pascal's later login, the
existing login flow may send at most one Supabase Auth login email.

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

An authenticated Order Flow acceptance run has two separate fail-closed phases. The existing
pre-cleanup acknowledgement is only for the state in which the documented matrix has produced
exactly the expected scenario 01 Process work, scenario 10 delivery/close work and one scenario 16
suppressed invitation attempt, while their mutable fixture parents still exist:

```powershell
npm run staging:cleanup -- --confirm-clean-staging --expect-order-flow-acceptance
npm run staging:cleanup -- --confirm-clean-staging --expect-order-flow-acceptance --confirm
```

`--expect-order-flow-acceptance` therefore means exactly `before_cleanup`; it is not accepted by
seed or verify. The separate retained-evidence acknowledgement is:

```text
--expect-order-flow-acceptance-after-cleanup
```

It means exactly `after_cleanup`: the two Board work rows, four completed idempotency rows and all
fixture-owned mutable parents have already been removed; the retained scenario 16 attempt has a
`NULL` interest parent through the existing foreign key; and the exact append-only evidence is
still present. It is not a general allowance for suppressed email or unexpected history.

In both phases, the tooling requires exactly one additional scenario 16
`order_invitation` attempt and one correlated delivery event, both `suppressed`, with no provider
ID or sent evidence. Zero, two or more candidates, another scenario/invitation, another template or
status, a wrong actor, changed correlation/idempotency relationships, changed audit/entity actions,
entities, sources or exact payload fingerprints, missing/extra event pairs, provider evidence, or
any unrelated mutable or append-only record blocks the run. Random runtime IDs are accepted only
through those semantic relationships; they are never added to the fixture allowlist.

For a Clean Staging environment already in the retained post-cleanup state, the safe sequence is:

```powershell
# 1. Read-only dry-run: prove the current post-cleanup state and retained evidence.
npm run staging:cleanup -- --confirm-clean-staging --expect-order-flow-acceptance-after-cleanup

# 2. Recreate only the version-controlled fixtures while preserving the validated evidence.
npm run staging:seed -- --confirm-clean-staging --expect-order-flow-acceptance-after-cleanup

# 3. Verify the complete fixture matrix plus the retained evidence.
npm run staging:verify -- --confirm-clean-staging --expect-order-flow-acceptance-after-cleanup

# 4. Later, preview the bounded cleanup selection again.
npm run staging:cleanup -- --confirm-clean-staging --expect-order-flow-acceptance-after-cleanup

# 5. After separate authorization, perform that exact limited cleanup.
npm run staging:cleanup -- --confirm-clean-staging --expect-order-flow-acceptance-after-cleanup --confirm

# 6. Read-only final proof of the post-cleanup state.
npm run staging:cleanup -- --confirm-clean-staging --expect-order-flow-acceptance-after-cleanup
```

Seed and verify preserve/accept the retained runtime evidence only with the explicit
`--expect-order-flow-acceptance-after-cleanup` flag. Without it they continue to reject the extra
attempt, delivery event and four audit/entity pairs. Passing both phase flags is an error. Use
`--help` on each staging command for its accepted phase semantics.

Manager removal is independent and explicit. `--remove-manager-user` requires
`--remove-manager-role` plus a process-scoped `SUPABASE_SERVICE_ROLE_KEY`, and performs only a
Supabase soft-delete of the exact fixture-owned Auth user; a reused user is never deleted. The
local ledger is `.tmp/clean-staging-seed-ledger.json` and contains only fixture/version identifiers,
UUIDs, table names and timestamps.

Limited cleanup removes marked mutable reservations, invitations, orders, payments and unreferenced
delivery attempts. For an explicitly acknowledged pre-cleanup Order Flow acceptance run it also
removes only the exact acceptance-created Board work and completed idempotency rows, before removing
their synthetic parents. A later after-cleanup-aware limited cleanup removes only re-seeded fixture
parents; the previously retained proof remains linked and unchanged. It never deletes
`product_registry`, migration history or append-only audit,
entity and delivery events. Delivery attempts referenced by retained delivery events also remain;
therefore the scenario 16 suppressed attempt and its delivery proof remain after their
`interest_request_id` is cleared by the existing `ON DELETE SET NULL` foreign key. The delivery
event keeps its `ON DELETE RESTRICT` reference to that attempt. Append-only triggers stay enabled.
The dry-run reports mutable deletes separately from retained history, and the confirmed transaction
rechecks the exact selection under locks before deleting. A complete reset remains the disposable
rebuild route.

Fixtures remain available throughout Pascal's review. Operational email stays suppressed and
Mollie is never called. A full reset is deliberately not automated: pause or replace Clean Staging,
rebuild it from the six allowlisted Order Flow Board migrations, seed again, and relink the isolated Preview only if
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
- recognizable constrained `record_origin` values applied only through trusted server/test paths;
  the two threshold fixtures deliberately use synthetic `customer` origin so they exercise the
  unchanged qualified-interest count, and remain bounded by exact fixture IDs, markers and
  reserved invalid email addresses;
- a repeatable, version-controlled seed process;
- a repeatable cleanup process with before/after counts and failure reporting;
- permission to rebuild Clean Staging completely from committed migrations and synthetic seed data.

Public submissions must never be able to choose a trusted record origin. Cleanup operates only on
unambiguously marked synthetic records; ambiguity is a stop, not permission to delete. The
version-controlled `PV-CLEAN-STAGING-V1` path now provides repeatable seed, verify and limited
cleanup commands through the scripts under [`scripts/staging`](../scripts/staging/) and the package
commands documented above. Limited cleanup intentionally retains marked append-only synthetic
history; a complete reset uses the disposable rebuild route. A later separately authorized task
executed the tooling. A read-only check on 2026-08-02 reconfirmed 14 reservations, 11 invitations,
9 orders and 7 payments, with all 14 reservations marked `test`; this check performed no seed or
cleanup.

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
6. Validate PR #18's later-timestamp migration through the same controlled path after its normal
   merge of current `main`.
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
