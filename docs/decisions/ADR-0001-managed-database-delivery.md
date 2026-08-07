# ADR-0001: Managed database delivery boundary

- Status: Accepted
- Date: 2026-08-07
- Decision owner: Pascal / Poster Valley

## Context

Clean Staging access evolved into a custom Windows credential chain spanning a hidden prompt,
PowerShell launcher, Codex process, nested PowerShell process, Supabase executable/Bun runtime, and
a JavaScript probe. The same password was transported in two environment variables and checked for
byte equality.

Several work blocks and pull requests then repaired or diagnosed that control chain instead of
advancing the Order Flow Board. The final privacy-safe measurement proved that both variables
arrived but were not byte-equal. More diagnostics could potentially explain or repair that specific
mutation, but would deepen a mechanism that should not exist.

The application stack itself was not the failure boundary. Moving to Hostinger or a self-managed VPS
would not remove the local handoff and would add operating-system, patching, backup, and security
responsibilities.

## Decision

1. Keep GitHub, Vercel, Supabase, Resend, and Mollie as the core providers.
2. Stop using an interactive local Codex session to carry a remote database password.
3. Make committed migration files on `main` the sole database-history authority.
4. Use GitHub Actions and a protected `clean-staging` environment for reviewed Staging migration
   plans and applies.
5. Keep Production in a separate protected environment with explicit human approval.
6. Use local PostgreSQL and deterministic tests for ordinary development.
7. Freeze further credential-launcher and handoff-probe repair.
8. Apply the stop and capacity rules in [OPERATING_RULES.md](../../OPERATING_RULES.md).

## Consequences

### Positive

- Removes the failing local credential process chain.
- Keeps secrets out of Codex and ordinary developer shells.
- Makes database changes repeatable, reviewable, and attributable to a commit.
- Separates feature work from infrastructure recovery.
- Reduces maintenance and AI-credit consumption.
- Preserves the existing product implementation and provider integrations.

### Trade-offs

- GitHub environment/secrets configuration is a one-time infrastructure task.
- The migration workflow needs careful target, drift, and scope checks.
- Hosted CI becomes a dependency for remote Staging changes.
- Provider-plan upgrades may be justified before commercial launch.

## Transition

1. Add the governance and architecture records.
2. Implement a minimal Staging workflow on a separate branch.
3. Validate the workflow's dry-run/plan output without Production or Legacy access.
4. Apply only the reviewed pending migration set after explicit approval.
5. Verify Clean Staging read-only.
6. Retire the local credential route after CI is proven.
7. Resume the current product milestone.

If the CI approach itself fails twice, stop and compare Supabase native branching/integration,
GitHub-hosted migration execution, and a narrowly scoped manual provider-console route. Do not build
another credential transport chain.
