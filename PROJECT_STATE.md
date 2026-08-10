# Project state

Last reviewed: 2026-08-10

## Current milestone

The Order Flow Board release has been reviewed end to end. Resume product work inside the existing
Poster Valley application while keeping database reconciliation separate from feature delivery.

## Current release conclusion

- The intended Order Flow database and application support is present in the release environment.
- Committed migration history is aligned for the release scope; no follow-up Order Flow migration is
  pending.
- Functional schema, authorization, lifecycle, threshold and history-protection contracts passed a
  read-only verification.
- The authenticated Board opened successfully on desktop and mobile without page-level overflow or
  browser-console errors.
- No database, customer-data, provider, fixture or environment mutation was performed during the
  review.

Migration-history equality is not treated as proof of complete schema equality. The release
environment is intentionally not claimed to be fully catalog-identical to a clean build from
`main`. That difference does not block the verified Order Flow functionality, but it remains a
separate infrastructure follow-up.

## Current decision

Do not mix catalog reconciliation into product releases. If exact reproducibility is required,
first produce a bounded read-only definition comparison and a minimal forward-reconciliation plan.
Any resulting environment write remains separately reviewed and explicitly approved.

Codex produces reviewable code, migrations, tests and pull requests without receiving remote
database credentials. Protected automation owns disposable-environment database delivery.
Production remains separately approved and protected.

See [ARCHITECTURE.md](ARCHITECTURE.md), [OPERATING_RULES.md](OPERATING_RULES.md), and
[ADR-0001](docs/decisions/ADR-0001-managed-database-delivery.md).

## Immediate sequence

1. Review this documentation-only release record through the normal pull-request path.
2. Keep the completed Order Flow release unchanged while product work resumes.
3. Track exact catalog reproducibility as an independent infrastructure task.
4. Keep future database changes on the database-first, protected release path.

## Frozen work

- Ad hoc Production catalog cleanup or migration-history repair.
- Further fixes to the retired local credential-handoff route.
- Any feature validation against Legacy Staging.
- Any unapproved Production database, email, payment or environment action.
