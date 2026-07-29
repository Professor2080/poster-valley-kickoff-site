# Release runbook and external-settings plan

This document is a review plan, not authorization. It performs no deployment, migration, email,
payment or external settings change.

## Release gate

Before requesting merge:

1. Verify repository/worktree identity and fetch refs.
2. Run `npm run verify -- <exact active-worktree contract>` from a clean-install worktree.
3. Confirm the complete diff contains no product behavior, API contract, schema, migration, data or
   provider-config change unless that scope was explicitly approved.
4. Confirm GitHub jobs `quality-gate` and `production-dependency-audit` pass. Treat
   `development-advisory-report` as visible non-blocking debt; do not run `npm audit fix`.
   Confirm CI reports Node `24.18.0`, npm `11.16.0`, and a real PR/push commit-range diff check.
5. Review the Vercel Preview for the exact commit. Preview must use Staging-only values, suppressed
   email and no live payment key.
6. Resolve review conversations and obtain explicit merge approval.
7. Merge through GitHub; let the connected Vercel project deploy `main`. Do not use a routine manual
   `vercel --prod`.
8. Any Production smoke test involving data, email or payment needs a separate bounded approval.

## GitHub plan

Read-only status on 2026-07-29: repository
`Professor2080/poster-valley-kickoff-site` is public; default branch `main` points to
`4542c441e63fdb5100ee4e5564f70b03be9a3926`; `main` is not protected; there are no repository
rulesets and no Actions workflows on that commit.

| Setting | Desired state | Exact future change | Risk/action/approval |
| --- | --- | --- | --- |
| `main` ruleset | active | create one branch ruleset targeting `main` | Dashboard/API write; owner approval required; a bad target can block all work |
| Pull requests | required | require PR before merge | Dashboard/API write; owner approval |
| Required checks | two stable gates | require `quality-gate` and `production-dependency-audit` after this workflow exists on the default branch | Dashboard/API write; names must first be observed on a PR |
| Conversations | resolved | require conversation resolution | Dashboard/API write; owner approval |
| Force-push/delete | blocked | disallow both for `main` | Dashboard/API write; owner approval |
| Reviews | pragmatic solo-owner mode | do not require a second approving reviewer yet | Dashboard/API write; revisit when another maintainer joins |

Do not enable required checks before their exact contexts have run successfully, or merges can be
deadlocked. No GitHub setting was changed in this task.

## Vercel plan

Read-only status: team `Professor2080`, project `poster-valley`, Node `24.x`, domains
`postervalley.nl`/`www.postervalley.nl`; deployment metadata identifies GitHub
`Professor2080/poster-valley-kickoff-site`. Production deployments observed from `main`; feature
branches receive Preview deployments. The current Production deployment for the baseline SHA is
ready. The latest overall deployment at inventory time was a Preview, so “latest” must never be
treated as “Production.”

| Setting | Desired state | Exact future change | Risk/action/approval |
| --- | --- | --- | --- |
| Git repository | kickoff repository only | verify in Project Settings > Git; change nothing if it matches | Dashboard read; relinking is high-risk and needs explicit approval |
| Production branch | `main` only | set/retain `main` in Git settings | Dashboard write if different; owner approval |
| Feature branches | Preview | retain automatic Preview deployments | Dashboard write only if currently disabled; owner approval |
| Environment separation | no Production values in Preview/Development | compare names and privately verify distinct values; remove/move only after a reviewed impact plan | Dashboard secret write; explicit approval and redeploy implications |
| Preview integrations | Staging/suppressed only | verify Preview Supabase ref is Staging and Mollie key is test-mode; keep operational mail disabled | Human dashboard check; never reveal values |
| Production deployment | Git merge only | avoid normal manual `--prod`; use connector read-only for status/logs | Deployment is an external write; explicit release approval |

## Supabase plan

Read-only project metadata matches the documented identities:

- Staging: `cdmocdodehjmcgtxicaj`, active and healthy;
- Production: `epqpeoubkbftcvxjbqeo`, active and healthy.

| Setting | Desired state | Exact future change | Risk/action/approval |
| --- | --- | --- | --- |
| Normal validation | Staging only | scope any approved remote validation to `cdmocdodehjmcgtxicaj` | Connector/CLI/database access; task-specific approval |
| Production | outside standard agent reach | no default credentials, MCP or automated writes | Any access needs separate explicit Production approval |
| GitHub deployment | no automatic Production database deploy | leave migration application outside CI | Dashboard/GitHub write if a conflicting integration exists; owner approval |
| Branching | not adopted yet | no change; assess cost/workflow in a separate proposal | Dashboard/cost-bearing change; explicit approval |
| Staging MCP | project-scoped, read-only, minimal tools | follow the disabled-config/OAuth steps in `environment-matrix.md` | Interactive OAuth and config write; Pascal approval |
| Local stack | future isolated work block | pin Supabase CLI devDependency, add reviewed `config.toml`, Docker prerequisites and local-only tests | Dependency/config/runtime change; explicit approval |

The connector could list projects but its branch-list request failed before returning state. A human
must confirm the Branching dashboard before relying on the current-status claim.

## Stop conditions

Stop before release or external action on:

- repository, branch, commit, project-ref or deployment mismatch;
- unexpected schema or migration-history difference;
- uncertain credential target/mode;
- Production values visible in Preview;
- missing/renamed required check;
- unreviewed product/API/migration/provider-config diff;
- any possibility of real email, payment or customer-data impact outside the approved release plan.
