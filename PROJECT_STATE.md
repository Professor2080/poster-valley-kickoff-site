# Project state

Last reviewed: 2026-08-07

## Current milestone

Make the Order Flow Board and its customer/admin flow reviewable on Clean Staging, then resume
in-stock commerce work inside the existing Poster Valley application.

The next product-value checkpoint is a working Preview that Pascal can evaluate. Tooling is useful
only when it directly enables that checkpoint.

## Current decision

The interactive local credential route is retired as a delivery strategy. Do not spend further
product capacity on the custom launcher, duplicate password variables, handoff probes, or
Codex-terminal credential transport.

Codex produces reviewable code, migrations, tests, and pull requests without receiving a remote
database password. GitHub Actions will own the Staging migration boundary through encrypted
environment secrets. Production remains separately approved and protected.

See [ARCHITECTURE.md](ARCHITECTURE.md), [OPERATING_RULES.md](OPERATING_RULES.md), and
[ADR-0001](docs/decisions/ADR-0001-managed-database-delivery.md).

## Immediate sequence

1. Merge this governance change after review.
2. Design the smallest GitHub Actions route that can verify migration scope and apply only reviewed
   migrations to Clean Staging.
3. Configure a protected GitHub `clean-staging` environment. Store credentials there; never pass
   them through Codex or a local launcher.
4. Prove the route first with dry-run/plan evidence and the already reviewed pending migration set.
5. Verify Clean Staging history and contracts read-only after the CI run.
6. Retire the local credential launcher only after the CI route has been proven.
7. Return immediately to the Order Flow Board Preview and Pascal's functional review.

Each numbered item is a separate, bounded work block. Production, Legacy Staging, live Mollie,
operational email, and customer data are outside this sequence.

## Current blockers

- The GitHub Actions-to-Clean-Staging route is not yet implemented or proven.
- The exact GitHub environment/secrets configuration is not yet verified.
- Clean Staging must not be mutated until the workflow diff, target ref, migration plan, and
  provider-suppression conditions have passed review.

## Frozen work

- Further fixes to the credential launcher or password-handoff probes.
- Migration-history repair experiments.
- A4 reporting/exports.
- Any migration or feature validation against Legacy Staging.
- Any Production database, email, payment, or deployment action.

## Definition of recovery

The architecture reset is complete when:

- no remote database password travels through a local Codex session;
- a reviewed migration commit can be promoted to Clean Staging by CI;
- the workflow proves its exact target and migration scope before applying;
- Clean Staging verification is reproducible and produces no secret values;
- Production uses a separate protected environment and explicit human approval;
- the next work item is product functionality, not another credential-handoff repair.
