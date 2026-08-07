# Clean Staging database delivery

This runbook defines the protected GitHub Actions boundary for migration planning and application to
Supabase Clean Staging. It does not authorize a workflow run, secret change, database connection,
migration or rebuild.

## Why this route

Supabase's native GitHub integration is the preferred managed default for straightforward automatic
deployments and preview branches. Poster Valley currently uses a separate existing Clean Staging
project and requires two independently approved actions: first produce reviewable plan evidence,
then apply exactly that plan. A separately approved rebuild may reset this disposable project from
the exact migrations on `main`. The repository therefore uses one small manual GitHub Actions workflow
instead of automatic provider deployment. Reconsider the native integration before expanding this
workflow or after two failures with this approach.

## Trust boundary

The workflow is manual-only and must be dispatched from `main`. It:

- runs the workflow and validation code from the current `main` commit;
- checks out the candidate commit separately and never executes its package scripts or JavaScript;
- requires the candidate to descend from the current `main` commit;
- requires every migration already on `main` and `supabase/config.toml` to remain byte-identical;
- accepts only new, ordered migration files whose exact versions match the operator input;
- hard-codes Clean Staging project ref `stbunwkgvxfwmbjivgos`;
- pins Supabase CLI `2.111.0` through the trusted lockfile;
- keeps raw CLI stdout/stderr out of logs and emits only classified JSON evidence;
- blocks remote-only history, edited history, ambiguous scope, an empty apply, a changed dry-run
  history, a stale plan digest and every target mismatch.
- accepts `rebuild` only when the candidate is exactly the workflow's current `main`, the existing
  remote history already equals all six committed migrations, the pending input is `NONE`, the plan
  digest is empty and the operator types `REBUILD stbunwkgvxfwmbjivgos`;
- rebuilds with the pinned CLI's official `db reset --linked --no-seed` path and verifies exact
  migration equality plus a non-mutating dry-run afterward.

Production `epqpeoubkbftcvxjbqeo` and Legacy Staging `cdmocdodehjmcgtxicaj` are never accepted.

## One-time GitHub configuration

Create a GitHub environment named exactly `clean-staging` before enabling the workflow. Configure:

1. required reviewer approval by Pascal or another explicitly authorized owner;
2. environment secrets `CLEAN_STAGING_SUPABASE_ACCESS_TOKEN` and
   `CLEAN_STAGING_DB_PASSWORD`;
3. only credentials belonging to Clean Staging, never Production or Legacy Staging;
4. a dedicated least-privilege or scoped Supabase token when the account/plan supports it;
5. no repository-level copy of either secret.

The database password and access token remain inside GitHub's protected job environment. They must
not be pasted into Codex, a local shell, workflow input, log, issue or pull request.

## Plan run

After reviewing the exact candidate commit and migration SQL:

1. Open **Actions -> Clean Staging Database Delivery -> Run workflow** on `main`.
2. Choose `plan`.
3. Enter the exact 40-character candidate commit SHA.
4. Enter the exact comma-separated pending migration versions, or `NONE` when proving an aligned
   baseline.
5. Leave `approved_plan_digest` empty.
6. Type `stbunwkgvxfwmbjivgos` as confirmation.
7. Review and approve the protected environment deployment.

A successful plan performs a remote migration-list read and `supabase db push --dry-run`; it does
not apply a migration. Preserve the safe JSON result containing the workflow SHA, candidate SHA,
remote versions, pending versions and `planDigest`.

## Apply run

Application is a separate workflow run and requires separate authorization for the exact candidate
and migration set.

1. Confirm the reviewed plan is still current and no repository/environment/provider fact changed.
2. Run the workflow from `main` with `apply`.
3. Re-enter the exact candidate SHA, expected pending versions and Clean Staging project ref.
4. Enter the exact 64-character digest from the reviewed plan.
5. Review and approve the protected environment deployment.

The apply run repeats target, history and dry-run validation before writing. It applies only when
the recomputed digest equals the approved plan digest, then requires remote history to equal the
candidate migration history. Any mismatch stops fail-closed.

## Rebuild run

A rebuild is destructive and is permitted only for the disposable Clean Staging project after
separate authorization. Run the workflow from `main`, choose `rebuild`, enter the exact current
`main` SHA, set pending versions to `NONE`, leave the plan digest empty, confirm the project ref and
type `REBUILD stbunwkgvxfwmbjivgos` in the rebuild field. Approve the protected environment job.

The job first proves that remote history already equals the six migrations on `main` and that a
dry-run is empty. It then performs `supabase db reset --linked --no-seed`, confirms all six
migrations were recreated, and repeats the empty dry-run check. It never targets Production or
Legacy Staging and does not seed fixtures automatically.

## Evidence and stop conditions

Record only the privacy-safe JSON result and GitHub run URL. Never copy raw provider output or
secret values. Stop without retrying when:

- the workflow/candidate SHA, project ref or environment differs;
- the candidate is not based on current `main`;
- an existing migration or `config.toml` changed;
- migration history is not an exact local prefix;
- pending versions differ from the reviewed input;
- the plan digest is stale or different;
- the workflow fails twice with the same approach.

After two failures, compare Supabase native GitHub integration/branching, this GitHub-hosted route
and a narrowly scoped provider-console alternative. Do not add a wrapper, launcher, credential
handoff or another diagnostic layer.
