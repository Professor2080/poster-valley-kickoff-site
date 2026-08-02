# PR #20 Production history reconciliation plan

Status: **candidate only; not authorized for execution**.

This directory is deliberately outside `supabase/migrations/`. The reconciliation changes only
Supabase migration-history metadata after the separately approved schema alignment has succeeded.
It never executes the canonical baseline SQL or the default-privilege migration SQL.

## Pinned targets and observed history

- Repository: `Professor2080/poster-valley-kickoff-site`.
- Branch: `codex/schema-baseline-v1`.
- Production project: `epqpeoubkbftcvxjbqeo`.
- Canonical files:
  - `20260731113000_schema_baseline_v1.sql`;
  - `20260731193947_harden_default_privileges.sql`.
- Production history observed read-only on 2026-08-02:
  - `20260707234351_create_kickoff_signup_tables`;
  - `20260720212806_admin_auth_data_foundation`;
  - `20260720212813_admin_auth_data_hardening`;
  - `20260720212838_admin_operational_actions`;
  - `20260720212845_admin_operational_actions_runtime_fix`;
  - `20260721093937_a3_1_admin_customer_data_record_origin`;
  - `20260721155649_admin_invitation_delivery_confirmation`.

The seven historical rows are preserved here as provenance. Marking a version `reverted` deletes
only its migration-history row; it does not undo its schema SQL. Marking a version `applied` inserts
only a migration-history row; it does not run the local SQL file. This is the documented Supabase
CLI `migration repair` behavior and is why this plan is allowed only after catalog alignment proves
that the canonical schema and hardening are already present.

## Mandatory prechecks

1. Re-run the repository preflight against the exact then-current branch SHA and `origin/main`.
2. Verify the CLI is exactly `2.111.0` and inspect `migration repair --help`, `migration list
   --help` and `db push --help` again.
3. Verify the database URL variable targets project `epqpeoubkbftcvxjbqeo` without printing it.
4. Read migration history through both the Supabase API and the CLI. Require the exact seven rows
   above and no others.
5. Re-run the complete catalog, grant, default-ACL and aggregate cardinality checks. Require the
   post-alignment contract, including four payment RPCs and the documented temporary legacy
   compatibility trigger/function.
6. Preserve a timestamped, redacted evidence record containing the Git SHA, the seven old rows,
   both canonical filenames and catalog hashes. Do not store a database URL or credential.
7. Obtain explicit approval immediately before the first `migration repair` command.

Use a process-scoped, percent-encoded connection string in
`SUPABASE_PRODUCTION_DB_URL`. Never echo it or put it in Git.

## Forward sequence

Run one history mutation at a time. After every command, rerun `migration list`; on any unexpected
row, name, ordering or error, stop and execute no later step.

```powershell
npm.cmd exec supabase -- migration list --db-url "$env:SUPABASE_PRODUCTION_DB_URL" --agent no

npm.cmd exec supabase -- migration repair 20260731113000 --status applied --db-url "$env:SUPABASE_PRODUCTION_DB_URL" --agent no
npm.cmd exec supabase -- migration list --db-url "$env:SUPABASE_PRODUCTION_DB_URL" --agent no

npm.cmd exec supabase -- migration repair 20260731193947 --status applied --db-url "$env:SUPABASE_PRODUCTION_DB_URL" --agent no
npm.cmd exec supabase -- migration list --db-url "$env:SUPABASE_PRODUCTION_DB_URL" --agent no
```

Only after both canonical versions are visible alongside all seven historical versions, mark each
historical alias reverted, one at a time and with `migration list` after every line:

```powershell
npm.cmd exec supabase -- migration repair 20260707234351 --status reverted --db-url "$env:SUPABASE_PRODUCTION_DB_URL" --agent no
npm.cmd exec supabase -- migration repair 20260720212806 --status reverted --db-url "$env:SUPABASE_PRODUCTION_DB_URL" --agent no
npm.cmd exec supabase -- migration repair 20260720212813 --status reverted --db-url "$env:SUPABASE_PRODUCTION_DB_URL" --agent no
npm.cmd exec supabase -- migration repair 20260720212838 --status reverted --db-url "$env:SUPABASE_PRODUCTION_DB_URL" --agent no
npm.cmd exec supabase -- migration repair 20260720212845 --status reverted --db-url "$env:SUPABASE_PRODUCTION_DB_URL" --agent no
npm.cmd exec supabase -- migration repair 20260721093937 --status reverted --db-url "$env:SUPABASE_PRODUCTION_DB_URL" --agent no
npm.cmd exec supabase -- migration repair 20260721155649 --status reverted --db-url "$env:SUPABASE_PRODUCTION_DB_URL" --agent no
```

The final history must contain exactly:

```text
20260731113000  schema_baseline_v1
20260731193947  harden_default_privileges
```

Then run only the dry-run form:

```powershell
npm.cmd exec supabase -- migration list --db-url "$env:SUPABASE_PRODUCTION_DB_URL" --agent no
npm.cmd exec supabase -- db push --dry-run --db-url "$env:SUPABASE_PRODUCTION_DB_URL" --agent no
```

The list must align local and remote one-for-one and the dry-run must report that the remote
database is up to date. An empty-looking or ambiguous output is not accepted without the matching
two-row list.

## Partial execution and metadata-only rollback

The safe forward order adds both canonical rows before removing any historical row. Therefore an
interruption never leaves Production without a recorded applied representation. Record every
completed command. To reverse only the completed metadata steps:

1. Mark each already-reverted historical version `applied` again, in its original ascending order,
   verifying the list after each command.
2. Only after all seven historical rows are restored, mark `20260731193947` and then
   `20260731113000` `reverted`, verifying after each command.
3. Re-run the catalog hash checks and prove that no schema object changed during either direction.

Example inverse command shape (replace `<version>` only with a recorded completed version):

```powershell
npm.cmd exec supabase -- migration repair <version> --status applied --db-url "$env:SUPABASE_PRODUCTION_DB_URL" --agent no
npm.cmd exec supabase -- migration repair 20260731193947 --status reverted --db-url "$env:SUPABASE_PRODUCTION_DB_URL" --agent no
npm.cmd exec supabase -- migration repair 20260731113000 --status reverted --db-url "$env:SUPABASE_PRODUCTION_DB_URL" --agent no
```

No direct write to `supabase_migrations.schema_migrations`, `db pull`, `migration fetch`, `db push`
without `--dry-run`, baseline execution or schema migration belongs in reconciliation.

## Database-first release sequence

1. Production compatibility read-only is green for the exact current state.
2. Apply `production_alignment_pr20.sql` under separate Production-DDL approval.
3. Verify schema, constraints, grants, default ACLs, RPCs and aggregate counts read-only.
4. Execute the history-only sequence above under a second explicit approval.
5. Require the aligned two-row migration list and an up-to-date dry-run.
6. Merge PR #20 normally only after explicit merge approval.
7. Let the existing GitHub integration deploy Vercel Production and verify the exact commit.
8. Run a public Production frontend smoke without payment or operational email.
9. Run the Production Admin login for `studio@postervalley.nl` without other mutations.
10. Pascal reviews frontend and Admin directly on Production.
11. Fix only visible, targeted problems; remove the temporary legacy compatibility trigger and
    function later through a separately reviewed contract migration after the PR #20 deployment is
    proven healthy.
