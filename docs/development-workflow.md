# Development workflow

## Baseline and identity

This repository is `Professor2080/poster-valley-kickoff-site`, package
`poster-valley-kickoff-site`. It is not the similarly named parent repository. `main` is the sole
Production source.

Start every task with the explicit contract from the task or trusted handoff:

```powershell
npm run preflight -- `
  -Role active `
  -ExpectedRoot "<absolute-active-worktree-path>" `
  -ExpectedCommonDirectory "<absolute-git-common-directory>" `
  -ExpectedBranch "codex/<topic>" `
  -ExpectedHead "<trusted-sha>"
```

Add `-ContinueExistingChanges` only when the current task explicitly resumes the already-present
changes. The command validates canonical root/common-directory/worktree identity, role, remote,
package, branch, detached state, optional HEAD pin, upstream, cached `origin/main`, live read-only
remote `main` and status. It performs no remote write and prints no environment values. Use
`-SkipRemoteLookup` only for an explicitly offline inspection.

For a read-only review, pass `-Mode inspect`. Inspect mode may report a dirty active, reference or
archive worktree without requiring `-ContinueExistingChanges`; it prints only Git status paths and
does not reset, stash, clean, checkout or otherwise mutate the worktree. Change mode remains
restricted to the active role and retains its explicit dirty-tree authorization.

## Choose one change route

Every task starts with the same repository preflight and then uses exactly one of these routes.
Database or environment drift changes the route; it is never an incidental repair inside a feature
task. Definitions of Done and release gates are in the [release runbook](release-runbook.md).

### Proportional control level

The change route determines the delivery process; the control level determines the evidence needed
for the actual diff. Choose the lowest level that covers every real effect of the change. Move to a
higher level only when the changed code, data flow or external action requires it.

| Level | Applies to | Proportional evidence |
| --- | --- | --- |
| **1 — text, documentation and simple UI** | Changes without API, authentication, data, payment or email impact. | Run only relevant lint, type or focused tests. Visually check the affected route when UI changes. Do not perform database, Staging or Production verification, and do not start a full security or infrastructure analysis. |
| **2 — normal functional development** | Functionality without schema changes, real provider actions or sensitive-data handling. | Run relevant tests and a Production build when executable code changes. Use the exact Preview and targeted browser checks for only the affected routes and user flows. Do not repeat previously proven baselines that the change cannot affect. |
| **3 — database, authentication, email or payments** | Schema, auth, payment, email, inventory, order or fulfilment changes. | Add separately authorized Clean Staging verification plus targeted migration, authorization and integration tests. Use synthetic data, suppressed email and provider test modes only. Check Production identity or credentials only when a separately authorized Production release actually includes a Production action. |
| **4 — Production or destructive actions** | Production data mutations, destructive migrations, real payments, real email, refunds or provider configuration. | Require explicit authorization for the exact action, complete the relevant release and rollback checks, verify identity and credentials fail-closed, and prefer transactional or otherwise recoverable execution. |

Already proven facts and baselines may be reused while the underlying relevant code and
infrastructure remain unchanged. Stop a task only for a concrete problem that materially prevents
safety, data integrity or correct delivery. Record non-critical observations as follow-up notes;
they do not block the task.

Do not expand a bounded task into a general audit, upgrade or cleanup. Do not run every conceivable
check when a smaller relevant set provides sufficient evidence. Final reports stay compact:
result, changed files, relevant checks, PR link and concrete attention points only.

### Fast path

Use this only when the diff has no database, authentication/authorization, payment, operational
email or external-provider impact. Ordinary documentation, styling and isolated UI changes qualify
when they do not change a security boundary.

1. Create a focused branch and separate active worktree from verified `origin/main`.
2. Implement the bounded change.
3. Run repository-local verification proportional to the change.
4. Perform at most one targeted review when the diff warrants it.
5. After separate publication authority, open a Draft PR.
6. Require GitHub Actions and the exact Vercel Preview for the candidate commit to pass.
7. Obtain explicit merge approval.
8. Perform the Production-route check from the release runbook.

A normal documentation, styling or isolated UI change without security impact does not require an
independent broad security review.

### Controlled path

Use this for database, authentication/authorization, payments, operational email, personal data,
inventory, orders, fulfilment or provider-webhook changes.

1. Implement the bounded change in its active worktree.
2. Run the complete local verification contract.
3. Obtain exactly one independent broad review.
4. Perform at most one targeted repair round.
5. Do not start another broad review after a successful repair unless a new `BLOCKER` or `HIGH`
   finding is discovered.
6. After separate publication authority, open a Draft PR and verify both required GitHub checks.
7. For a migration, prove that Clean Staging and `main` have identical pre-feature migration
   history and that the dry-run lists only the intended migration.
8. Apply the migration only after separate Clean Staging authorization.
9. Run synthetic concurrency, idempotency and transaction tests.
10. Run the authenticated Vercel Preview scenario against Clean Staging.
11. Remove synthetic test records and record cleanup evidence.
12. Obtain separate Production-release approval.
13. Use database-first release when backward-compatible, then verify Production read-only after the
    application deploy.

The migration-specific contract is authoritative in the
[database release process](database-release-process.md). Clean Staging now exists, but until its
pre-feature history matches committed `main`, migration steps 7 onward are blocked rather than
redirected to inactive Legacy Staging.

### Infrastructure path

Always use a separate infrastructure task and, when files change, a temporary infrastructure
worktree for:

- creating or replacing an environment;
- migration-history problems;
- environment scopes, project links or secret rotation;
- GitHub rulesets;
- hosting, domains or provider configuration;
- backups and recovery.

An infrastructure problem is not solved in the middle of a product feature. The Clean Staging
creation sequence is in the [Clean Staging runbook](clean-staging-runbook.md).

## Common change discipline

1. Fetch refs only with `git fetch origin --prune`.
2. Verify the expected `origin/main` SHA and a clean reference worktree.
3. Create a focused `codex/<topic>` branch and separate worktree from that exact SHA.
4. Read `AGENTS.md` and the task-relevant linked documents.
5. Make only the approved change; preserve unrelated and protected worktrees.
6. Run the verification required by the selected route.
7. Review the complete diff and prove that out-of-scope files did not change.
8. Stop uncommitted unless the current request explicitly authorizes a commit.
9. When authorized, use a focused commit, push, Draft PR, CI, Vercel Preview, human review and a
   separately approved merge.

Never develop directly on `main`. Never treat permission to edit as permission to commit, push,
open/update a PR, merge or deploy.

## Review severity and stop rules

- `BLOCKER` and `HIGH` findings must be resolved before publication or release.
- `MEDIUM` findings must be resolved before release or explicitly accepted by Pascal.
- `LOW` and `NOTE` findings are recorded but do not automatically block.
- Do not create review-on-review loops without a concrete new technical finding.
- Stop immediately on a wrong project target, a Production target during Staging work, migration
  drift, unexpected diff files, secrets or personal data in output, an ambiguous dry-run, or any
  provider/database action outside scope.

## Local verification

Select local checks from the proportional control level above. A documentation-only Level 1 change
does not require an install, full application test, Production build, browser run, Preview or
database access unless the changed document has a focused repository check. Required CI may still
run after publication, but it does not make unrelated local verification necessary.

`npm run verify -- <contract>` is PowerShell-friendly and runs:

- repository preflight;
- `npm ci`;
- lint;
- all Node tests;
- production build;
- unstaged and staged local `git diff --check`;
- conflict-marker and trailing-whitespace checks;
- tracked-secret and browser-environment-access checks;
- Vercel function budget;
- environment-key policy.
- skill-governance, link and Staging-MCP documentation checks.

Use `npm run verify -- -SkipInstall` only after a successful `npm ci` in the same worktree. The
verification path has no database, Supabase, email, payment or deployment step.

Migration-bearing Schema Baseline v1 changes also run `npm run test:schema-baseline` separately.
The GitHub `quality-gate` provides a fresh PostgreSQL 17 service for that loopback-only command; it
applies the sole active migration twice from `template0`, executes the permanent catalog and
runtime contracts, verifies both canonical fingerprints and removes the temporary databases. This
is the only workflow expansion made for the baseline proof and it performs no Supabase-project or
provider access.

To compare environment key names without printing values:

```powershell
npm run env:audit -- --names-file .env.names --environment preview
```

The input may contain `KEY` or `KEY=value`; only the key names are retained or printed. Keep
`.env.names` untracked. Missing required names fail by default. `--allow-missing` is an explicit
inventory-only mode and does not prove a valid environment.

The secret scan is defense-in-depth, not proof that every possible credential encoding is absent.
It detects known token formats, credential-bearing database URLs, contextual sensitive
assignments, and common browser-exposure patterns. A synthetic marker never skips a line or known
credential pattern; it is accepted only with a narrow, unambiguous placeholder in approved
documentation or tooling-test paths. In client code, the only permitted environment reads are
exact direct dot accesses to `import.meta.env.VITE_SUPABASE_URL` and
`import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY`. Every other executable `import.meta.env` form and
every executable `process.env` source fail closed; comments and string-only examples are ignored.
Full Unicode property identifiers are consumed before exact allowlist comparison. Parenthesized
sources, optional chaining and bracket/computed access are forbidden. This deliberately local
syntax-token convention avoids relying on incomplete JavaScript dataflow analysis; it is not a
cross-file or runtime dataflow proof. Review the complete diff and provider-side secret controls
separately.

The Vercel budget treats non-underscore `.js`, `.mjs`, `.cjs`, `.ts`, `.mts` and `.cts` files under
`api/` as deployable entrypoints, including nested routes. Underscore-prefixed modules and TypeScript
declaration files are helpers. Any other file form under `api/` fails closed until explicitly
classified.

### Vercel Function budget

Production currently uses 12 of 12 Vercel Functions. Before adding a backend endpoint, determine
whether it creates another deployable function. Extend an existing grouped handler when that is
logical and maintainable; never add a thirteenth function silently. A larger handler architecture
change or Vercel subscription change requires a separate decision.

Run `npm run check:function-budget` when API entrypoints, Vercel routing or related function
classification changes. Documentation-only and purely frontend work does not require a fresh full
function-budget investigation.

Local and CI whitespace checks use different evidence. Local verification checks staged and
unstaged worktree changes; the repository text scan covers untracked text. CI fetches full history
and checks every commit plus the final PR/push range, so it never relies on an empty checkout diff.

## Reproducible tools

- Runtime target: Vercel Node `24.x`; the reviewed local and CI toolchain is exactly Node
  `24.18.0`.
- Package manager: exactly npm `11.16.0`; CI activates and asserts it before `npm ci`.
  `packageManager` is a tooling signal, while the version check is enforcement. `package-lock.json`
  lockfile version 3 is authoritative.
- Vercel CLI: use an exact project-local invocation such as `npx --yes vercel@56.3.1 --version`
  when a future approved task needs the CLI. Do not silently use `latest` or upgrade the global
  installation.
- Supabase CLI: it is currently absent. The official npm installation is a pinned project
  devDependency (`npm install --save-dev --save-exact supabase@<reviewed-version>`) invoked with
  `npx supabase`. Adding it and initializing a local stack are a separate approved work block.
- Codex CLI: `codex-cli 0.145.0` was observed. Check with `codex --version`,
  `codex mcp list`, and `codex plugin list`; do not install or authenticate a provider implicitly.

The pinned numbers record the verified foundation, not an evergreen upgrade policy. Review release
notes and the complete lockfile diff before changing them.

## Agent workflows

Codex officially discovers repository skills under `.agents/skills`. This repository currently
contains three reviewable drafts:

- Poster Valley Preflight;
- Poster Valley Safe Change;
- Poster Valley Release Gate.

Their implicit invocation remains disabled until owner review and regression-test approval. They
point back to `AGENTS.md` and these documents rather than copying policy. No Production MCP is
configured. See the [skill register and governance policy](skills/README.md).
