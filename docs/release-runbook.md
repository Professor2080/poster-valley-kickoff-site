# Release runbook and external-settings plan

This document defines release evidence and approval gates. It is not authorization to commit, push,
open/update a PR, merge, deploy, migrate, change external settings, send email or create a payment.
Choose the fast, controlled or infrastructure route in the
[development workflow](development-workflow.md) before using this runbook.

## Recorded release-platform status

As recorded on 2026-07-31:

- `main` is `5e58e9d75c709c52473c576ca859aee6c4f9c474`;
- GitHub ruleset `Protect main` is active;
- required checks are `quality-gate` and `production-dependency-audit`;
- the existing GitHub integration builds Vercel Preview for feature branches and Vercel Production
  from `main`;
- Production Supabase is `epqpeoubkbftcvxjbqeo` and unchanged;
- Legacy Staging `cdmocdodehjmcgtxicaj` is frozen and not a valid migration baseline;
- Clean Staging has not been created.

Ruleset, CI, Vercel, Supabase or provider dashboard state must be rechecked read-only for the exact
candidate when it becomes release evidence. A recorded status never authorizes a write.

## Universal release gate

Before requesting merge:

1. Re-run repository preflight with the exact active-worktree contract and current remote lookup.
2. Run the verification required by the selected route and review the complete diff.
3. Confirm the diff classification: product behavior, API, schema/migration, data, authorization,
   personal data and provider configuration must all be explicit.
4. Confirm GitHub checks `quality-gate` and `production-dependency-audit` pass for the exact candidate
   commit. Do not rename or bypass them and do not use `npm audit fix` as release repair.
5. Review the exact Vercel Preview commit. Any database-backed/authenticated validation requires
   separately approved Clean Staging; operational email stays suppressed and Mollie stays in test
   mode.
6. Resolve blocking review findings under the review limits in the
   [development workflow](development-workflow.md).
7. Obtain explicit merge approval. Merge through GitHub and let the existing integration deploy
   `main`; do not use routine manual Production deployment.
8. Treat every Production migration, settings change, data mutation, real-email/payment smoke test
   and customer-record interaction as its own bounded approval gate.

## Definition of Done: fast path

- [ ] Scope is confirmed as having no database, auth, payment, operational-email or provider impact.
- [ ] Required local checks are green.
- [ ] The complete diff is clean and contains only expected files.
- [ ] Required CI checks are green for the exact candidate.
- [ ] Vercel Preview is green for the exact candidate.
- [ ] Merge is explicitly approved.
- [ ] After deployment, the intended Production outcome is checked read-only.

An ordinary documentation, styling or isolated UI change without safety impact has no independent
broad security-review gate. At most one targeted review is used when its diff warrants it.

## Definition of Done: controlled path without migration

- [ ] Exactly one independent broad review is complete.
- [ ] At most one targeted repair round is complete, if needed.
- [ ] Tests and applicable security checks are green.
- [ ] Synthetic authenticated Preview validation is complete against Clean Staging when database or
  Auth behavior is involved.
- [ ] Providers outside Production are confirmed suppressed/test-mode.
- [ ] Synthetic data is cleaned up with evidence.
- [ ] Merge and Production release are each explicitly approved.
- [ ] Production is checked read-only after deployment.

Do not start another broad review after a successful repair unless a new `BLOCKER` or `HIGH` is
discovered.

## Definition of Done: controlled path with migration

All controlled-without-migration items apply, plus:

- [ ] Clean Staging migration history before the feature is exactly equal to committed history on
  `main`.
- [ ] The verified-target dry-run lists only the intended migration or approved set.
- [ ] The migration is applied to Clean Staging under separate approval.
- [ ] Schema, RLS, grants, function privileges and RPC contracts are checked.
- [ ] Synthetic concurrency, idempotency and transaction tests are green.
- [ ] The authenticated Vercel Preview flow is green against Clean Staging.
- [ ] Synthetic records and accounts are cleaned up and cleanup status is recorded.
- [ ] A rollback or forward-fix plan is recorded.
- [ ] The Production migration is separately approved, re-gated and applied before the application
  merge/deploy when backward-compatible.
- [ ] The final report records baseline/candidate Git SHAs, target project ref, migration version,
  tests, provider boundaries and cleanup status.

The [database release process](database-release-process.md) is authoritative for migration entry,
database-first release and `expand -> migrate -> contract`. If Clean Staging does not exist or does
not match `main`, this Definition of Done cannot pass.

## Production release control

- `main` is the sole Production source; feature work never happens directly on it.
- Backward-compatible database work releases database-first under separate Production-migration
  approval, followed by application merge/deploy and read-only verification.
- Contract-breaking work spans releases so old and new callers can coexist.
- Production is never used for feature development, experimental verification or synthetic
  concurrency testing.
- No automatic Production database migration is added to CI.
- A successful Draft PR, CI run, Preview or Clean Staging migration grants no Production authority.

## Infrastructure and environment gates

| Area | Required state | Separate approval boundary |
| --- | --- | --- |
| GitHub | `Protect main` active; exact two required checks green | ruleset/check changes |
| Vercel | GitHub-integrated Preview and `main`-only Production | environment variables, relinking, redeploy or manual deployment |
| Clean Staging | created from `main`; exact migration-history equality; synthetic data only | cost, creation, linking, migration and stateful testing |
| Legacy Staging | frozen; no feature migrations or release validation | later archival/removal decision |
| Production Supabase | exact ref `epqpeoubkbftcvxjbqeo`; real data | every migration, Auth/role or data change |
| Resend/Mollie | suppressed/test-mode outside Production | enabling real delivery/payment or any real smoke test |

The current transition status and next steps are in the
[Clean Staging runbook](clean-staging-runbook.md).

## Stop conditions

Stop before release or external action on:

- repository, worktree role, branch, commit, project ref or deployment mismatch;
- a Production target during Local, Preview or Staging work;
- missing, extra or remote-only migration history;
- an empty, ambiguous or over-broad migration dry-run;
- Production values visible in Preview;
- missing/renamed required checks;
- unexpected files or scope in the diff;
- secrets or personal data in output, logs, URLs, events or errors;
- unresolved `BLOCKER`/`HIGH`, or unaccepted `MEDIUM` findings;
- any database/provider action outside the exact approval.
