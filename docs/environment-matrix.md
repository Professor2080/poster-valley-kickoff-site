# Environment matrix

## Active operating model

| Environment | Code/deployment | Data target | Data | Email/payment | Normal use |
| --- | --- | --- | --- | --- | --- |
| Local | active local feature worktree | local/mocked only; no remote database by default | synthetic only; never customer data | providers mocked, operational email suppressed, no live payment | development and automated tests |
| Vercel Preview | GitHub-integrated feature-branch Preview | Clean Staging only, after separate approval and baseline apply | synthetic accounts and records only | operational email suppressed; Mollie test mode only | browser and authenticated candidate validation |
| Clean Staging | Supabase `stbunwkgvxfwmbjivgos`, `eu-west-1`, recorded `ACTIVE_HEALTHY` | canonical baseline plus default-privilege hardening applied and verified; rebuild only from committed migrations | synthetic only; disposable and reproducible; fixture set `PV-CLEAN-STAGING-V1`; never a Production copy | operational delivery suppressed; no Mollie or Resend provider calls from fixture tooling | separately authorized seed, concurrency, idempotency, transaction and authenticated Preview tests |
| Production | Vercel Production from `main` | Supabase `epqpeoubkbftcvxjbqeo` | real customer data | real external effects possible | separately approved releases only; never feature development |

Vercel Preview and Production are built through the existing GitHub integration. Until Clean
Staging has been proven equal to the committed pre-feature migration history on `main` and the
canonical baseline has been applied under separate authorization, database-backed Preview
validation is blocked. It does not fall back to another remote database.

The version-controlled staging tooling requires exact project-ref checks, an explicit
`--confirm-clean-staging` acknowledgement, `SUPABASE_URL` for exact Clean Staging, and a project-local
authenticated Supabase CLI link pinned to `stbunwkgvxfwmbjivgos`. Database operations
use the official linked Management API query route after a read-only `postgres` owner, transaction,
trigger and six-migration gate. They do not use a database URL, password, Direct connection, Shared
Session Pooler or Transaction Pooler, and add no permanent grants or staging RPC. The normal chain
reuses exactly one confirmed fixture-owned Auth identity from a PII-minimized database inventory and
needs no service-role key. That key is required only for the separately explicit Auth soft-delete
option. Limited cleanup retains marked append-only synthetic history; a complete cleanup is a
rebuild of the disposable project from committed migrations. Production and Legacy Staging are
rejected targets. Fixtures remain present during review, operational email remains suppressed, and
Pascal's actual Admin login may trigger at most one Supabase Auth login email.

That fixture path is separate from migration delivery. Remote migration planning and application
use only the protected manual workflow in
[Clean Staging database delivery](clean-staging-ci-delivery.md). Its database password and Supabase
access token exist only as protected GitHub environment secrets; neither value is available to
Codex, local launchers, Preview or fixture tooling.

Never infer a target from a URL, alias or variable name. Verify the exact repository, project ref,
deployment environment, branch/commit, migration history and credential mode before any remote
action. Environment access or a code-change request does not itself authorize a stateful test,
migration, provider call or deployment.

## Legacy Staging

Supabase project `cdmocdodehjmcgtxicaj` is:

> **INACTIVE frozen legacy environment — not a valid migration baseline**

It contains remote-only migration-history versions `20260719175848` and `20260722111632` and is not
reproducible solely from the committed migrations on `main`. Keep it frozen for now. Do not deploy
new feature migrations to it, access it for this transition, use it for feature validation, copy
its remote-only history into Git, or treat it as a source of truth.

Migration-history recovery is stopped. A prior `migration fetch` overwrote tracked migration files
inside a temporary verification worktree, and the fetched A4 migration did not exactly match a
known Git version. Those recovery files are not authoritative. Do not use `migration repair`,
`db pull`, placeholder migrations or direct changes to `supabase_migrations.schema_migrations` to
make Legacy Staging appear aligned. See the
[database release process](database-release-process.md) and
[Clean Staging runbook](clean-staging-runbook.md).

## Environment key policy

`.env.example` is the name-level baseline. `npm run env:audit` verifies that every key is
classified.

- Browser-safe: only `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
- Server-only: every other listed key, including every service-role key and application secret.
- Preview uses only Clean Staging public/server configuration after the baseline has been applied
  and the environment linkage is separately approved. It must never reuse Production Supabase
  values.
- Preview and Clean Staging use distinct non-production Admin secrets, suppressed operational mail
  and a verified Mollie test credential/test mode.
- Operational Production-only settings include real Resend delivery, real sender identity and live
  Mollie configuration.
- Local development remains database-free and provider-mocked by default, even if a developer has
  local variables.

The audit compares names only. It cannot prove that same-named variables have different values,
that delivery is suppressed, or that a Mollie credential is test-mode. Verify those properties in
the exact provider/environment without printing values, under separate authorization.

## Environment-specific stop conditions

Stop immediately when:

- the project ref, deployment, branch/commit, migration history or credential mode differs from the
  approved target;
- Production appears during a Local, Preview or Staging task;
- Preview contains Production values or could send operational email/create a live payment;
- Clean Staging pre-feature migration history is not exactly equal to `main`;
- a dry-run contains anything beyond the intended migration;
- synthetic data cannot be identified and safely cleaned up.

## Future read-only Supabase Staging MCP

This heading and server name are retained for tooling compatibility. The configuration below is a
disabled, read-only **Legacy Staging inspection** template only. It is not a normal validation
target, does not authorize access, and must never be used to establish release readiness or repair
history. The existing Clean Staging project requires a separate, reviewed MCP configuration for
`stbunwkgvxfwmbjivgos`; this Legacy-only placeholder is not that configuration and must not be
enabled or repointed during a product task.

In a separately approved interactive Legacy-inspection task only:

1. Put `mcp_oauth_credentials_store = "keyring"` in the user-level Codex configuration; credential
   storage is machine-local.
2. Add this disabled server to the trusted repository configuration:

   ```toml
   [mcp_servers.supabase_staging]
   url = "https://mcp.supabase.com/mcp?project_ref=cdmocdodehjmcgtxicaj&read_only=true&features=database%2Cdebugging"
   auth = "oauth"
   enabled = false
   default_tools_approval_mode = "prompt"
   enabled_tools = ["list_tables", "list_extensions", "list_migrations", "get_logs", "get_advisors"]
   ```

3. Verify the exact Legacy project ref, `read_only=true`, the minimal tool list and the absence of
   write-capable feature groups. Keep the server disabled unless Pascal authorizes the bounded
   inspection.
4. Inspect configured servers with `codex mcp list` and the exact entry with
   `codex mcp get supabase_staging`. Stop on any broader scope or different project.
5. To end the separately approved inspection, disable the entry first, run
   `codex mcp logout supabase_staging`, and use `codex mcp remove supabase_staging` only when that
   command owns the active entry. Confirm with `codex mcp list` that no active server remains.

Configuration removal and provider-side OAuth revocation are distinct. If provider-side revocation
is required, Pascal must revoke the exact grant in the relevant account UI. No Production MCP is
permitted.
