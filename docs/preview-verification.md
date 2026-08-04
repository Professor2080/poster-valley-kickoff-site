# Poster Valley Preview verification

## Purpose and scope

`scripts/verify-preview.ps1` is the fail-closed, read-only contract for proving that one explicit
Vercel Preview deployment belongs to the expected Poster Valley repository, feature branch and
commit. It verifies deployment metadata and a small allowlist of read-only routes. It does not
deploy, promote, alias, link, configure or mutate anything.

The script never accepts Vercel Production. It also never selects `latest`, infers a deployment
from the current project, or discovers a candidate by listing deployments. The operator must supply
the full feature branch, full 40-character commit SHA and immutable Preview deployment URL.

This contract is not an authenticated product-flow test. Database-backed or authenticated Preview
validation remains a separate, explicitly authorized activity under the environment and release
runbooks.

## Prerequisites

- Use a clean task worktree for `Professor2080/poster-valley-kickoff-site`.
- Push the exact feature-branch commit before verification. The remote branch must resolve to the
  supplied SHA.
- Wait for the GitHub-integrated Vercel Preview deployment for that exact commit.
- Use the immutable deployment URL ending in `.vercel.app`, not a Production/custom-domain alias.
- Have an existing authenticated Vercel CLI available. On Windows the resolver deliberately uses
  the application shim `vercel.cmd`; it never invokes `vercel.ps1`.
- Have the Windows `curl.exe` application available for direct unauthenticated HTTPS `GET` route
  checks. The verifier does not use `vercel curl`, because that command can request a local project
  link before it runs.
- Do not pass a token or protection-bypass secret on the command line. The script uses only the
  existing CLI authentication state and never prints or inspects it.

The expected Vercel project name is `poster-valley`. Verify that value against the
Draft PR Preview before running the command; do not infer identity from a local folder name.

## Inputs

All candidate-defining inputs are explicit:

| Input | Required | Meaning |
| --- | --- | --- |
| `ExpectedBranch` | yes | Non-`main` Git feature branch. |
| `ExpectedSha` | yes | Exact 40-character commit SHA. |
| `PreviewUrl` | yes | Exact immutable HTTPS Vercel deployment URL. Query strings, fragments and embedded credentials are rejected. |
| `ExpectedVercelProject` | yes | Expected Vercel project identity. |
| `ExpectedRepository` | no | GitHub repository identity; defaults to `Professor2080/poster-valley-kickoff-site`. |
| `DeploymentId` | no | Optional expected Vercel deployment ID. The gate is `SKIP` when omitted. |
| `BranchAlias` | no | Optional Vercel branch alias. When supplied, it must resolve to the same deployment ID/URL. The gate is `SKIP` when omitted. |

`FixtureDirectory`, `VercelCommandName` and `CurlCommandName` exist only for automated tests. Fixture injection is
refused unless the child process explicitly sets `PV_PREVIEW_TEST_MODE=1`; it is not an operator
verification route. The mocked runtime scenarios are Windows-only because they verify Windows
PowerShell and `.cmd` resolution; Node's test runner marks them `SKIP` on non-Windows CI hosts. The
platform-independent npm-entrypoint contract continues to run on every host.

## Command

From the exact task worktree, use the npm entrypoint so the repository has one implementation of
the contract:

```powershell
npm.cmd run verify:preview -- `
  -ExpectedBranch 'codex/example-branch' `
  -ExpectedSha '0123456789abcdef0123456789abcdef01234567' `
  -PreviewUrl 'https://poster-valley-kickoff-site-example.vercel.app' `
  -ExpectedVercelProject 'poster-valley' `
  -DeploymentId 'dpl_example' `
  -BranchAlias 'poster-valley-kickoff-site-git-codex-example.vercel.app'
```

Omit `DeploymentId` or `BranchAlias` only when that optional corroborating value is genuinely not
part of the evidence set. Never replace the deployment URL with `latest`, a Production URL or an
unverified alias.

## Gates

The script reports each executed gate as `PASS`, `FAIL` or `SKIP`:

1. explicit non-Production branch, full SHA and immutable Preview URL;
2. repository root, origin identity, clean worktree, local branch/HEAD and remote branch SHA;
3. executable Vercel application shim (`.cmd`, `.exe` or `.com`, with `.cmd` preferred on Windows);
4. deployment/build metadata for the explicit URL plus project metadata matched once by the same
   deployment ID and immutable URL;
5. Vercel project identity and optional deployment ID;
6. deployment state exactly `READY`;
7. target is Preview and is not Production;
8. deployed Git repository, branch and SHA;
9. input URL is the immutable deployment URL;
10. deployed function metadata is auditable and contains at most 12 functions;
11. optional branch alias resolves to that exact deployment;
12. direct unauthenticated `curl.exe` `GET` routes `/`, `/privacy`, `/terms` and `/admin` return HTTP 2xx/3xx;
13. unauthenticated `GET` requests to `/api/admin/authorization` and
    `/api/admin/delivery-status` are safely rejected with HTTP 401/403.

The route allowlist and HTTP method are fixed in the script. It sends no request body and never
calls email, payment, fulfilment, shipping, database or provider-mutation endpoints. A 2xx response
from an unauthenticated protected Admin API is a failure, not success.

`SKIP` is permitted only for the optional deployment-ID and branch-alias corroboration gates. A
missing CLI, credential failure, absent deployment metadata, unauditable function list or route
that cannot be executed is a required-gate `FAIL` and produces a non-zero exit.

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | Every required gate passed; only explicitly optional gates may be `SKIP`. |
| `1` | One or more required verification gates failed or could not execute. |
| `2` | Candidate input was invalid or unsafe before remote inspection began. |

## Failure interpretation

| Failure | Interpretation and safe response |
| --- | --- |
| Repository, branch, HEAD or remote SHA mismatch | Stop. Re-establish the exact candidate; do not verify another deployment. |
| Vercel CLI or credential error | Stop. Report only the sanitized error category; do not print, request or replace credentials in this work block. |
| Project/repository/branch/SHA mismatch | Stop. The URL is not evidence for this candidate. |
| Target is Production | Hard stop. Do not retry against that target and do not promote or alter it. |
| State is not `READY` | Stop and wait for the exact deployment; do not select a newer deployment implicitly. |
| Immutable URL or branch alias mismatch | Stop. Resolve the correct exact Preview evidence outside the script without changing aliases. |
| Function count missing or greater than 12 | Stop. Inspect the exact deployment/build result; do not relax the budget. |
| Required public route is 4xx/5xx | Treat the Preview candidate as failed. |
| Protected Admin API is not 401/403 | Treat it as a security failure and do not perform an authenticated fallback. |

## Evidence and redaction

Store only the sanitized console lines needed for the Draft PR review, for example:

```text
[PASS] repository candidate - repository, clean worktree, branch, local HEAD and remote branch match
[PASS] deployment readiness - state is READY
[PASS] Preview environment - deployment is a Preview target and not Production
[PASS] deployed function budget - 12 of 12 functions
[PASS] safe admin API /api/admin/authorization - unauthenticated GET rejected with HTTP 401
PREVIEW VERIFICATION PASS
```

Record separately the branch, full commit SHA, immutable Preview URL, optional branch alias,
execution timestamp and exit code. Never record CLI authentication state, tokens, cookies,
protection-bypass values, environment-variable values, response bodies, personal data or provider
credentials. Credential-shaped command failures and connection strings are redacted before output.

## Non-effects, rollback and Production prohibition

The verifier performs only Git reads, `vercel inspect`, a project-scoped `vercel list`, and
allowlisted direct `curl.exe` GET requests. The list result is never used to choose `latest`: the script
accepts only the single row with the already inspected deployment ID and immutable URL. It
does not read or write `.env` files, Vercel environment variables, Supabase configuration, database
state, deployment aliases or project links. It does not send email, create payments, release
fulfilment, change shipping, deploy, promote, merge or write provider configuration.

Because the verifier creates no remote state, operational rollback is normally unnecessary. After a
failed run, preserve the sanitized evidence and fix or reselect the candidate through a separately
authorized workflow. Do not compensate by changing Production, aliases, credentials or environment
configuration. Production is prohibited as both an input and a fallback target.
