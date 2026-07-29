# Environment matrix

## Boundaries

| Environment | Code/deployment | Data target | Email/payment | Normal agent access |
| --- | --- | --- | --- | --- |
| Local | local feature worktree | none by default | suppressed; no payment | yes, database-free |
| Preview | Vercel feature-branch Preview | Supabase Staging only when separately approved | suppressed; Mollie test credential only after its mode is verified | code/CI yes; remote state no by default |
| Staging | isolated validation target | `cdmocdodehjmcgtxicaj` — Poster Valley Kickoff Staging | synthetic data only; no live mail/payment | separate scoped approval |
| Production | Vercel Production from `main` | `epqpeoubkbftcvxjbqeo` — Poster Valley Kickoff | real external effects possible | separate explicit task only |

Never infer the target from a URL or variable name alone. Stop if repository, project ref,
deployment target, schema/history or credential scope is uncertain.

## Environment key policy

`.env.example` is the name-level baseline. `npm run env:audit` verifies that every key is classified.

- Browser-safe: only `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
- Server-only: every other listed key.
- Server-only in Preview/Staging and Production: Staging-specific Supabase server keys,
  `ADMIN_ACTION_SECRET`, `ADMIN_INVITATION_TOKEN_SECRET` and `ADMIN_CONFIRMATION_SECRET`. Preview
  and Staging need their own synthetic Admin secrets for approved invitation-token rotation and
  confirmation-proof validation.
- Operational Production-only: `RESEND_API_KEY`, legacy `VERSEL_RESEND_API_KEY`,
  `OPERATIONAL_EMAIL_*`, live Mollie configuration and real sender identity.
- Preview/Staging may contain only Staging server keys and test/suppressed integration settings.
  They must never contain or reuse Production values; operational email remains suppressed.
- Development is local and database-free by default, even if a developer has local variables.

The audit distinguishes allowed, required, disallowed, unexpected and browser-prefixed secret
names. With `--names-file`, missing required names fail unless the explicitly report-only
`--allow-missing` flag is used. The audit compares names only: it cannot prove that same-named
variables have distinct values, that delivery is actually suppressed, or that a Mollie key is
test-mode. Those remain human dashboard gates without copying values into logs or chat.

## Read-only inventory on 2026-07-29

Vercel project `Professor2080/poster-valley` is linked by deployment metadata to GitHub
`Professor2080/poster-valley-kickoff-site`. It uses Node `24.x`; Production deployments shown by the
connector come from `main`, while feature branches receive Preview deployments.

Observed Vercel key names:

- Production: `ADMIN_CONFIRMATION_SECRET`, `ADMIN_INVITATION_TOKEN_SECRET`,
  `OPERATIONAL_EMAIL_REPLY_TO`, `OPERATIONAL_EMAIL_FROM`,
  `OPERATIONAL_EMAIL_DELIVERY_ENABLED`, `POSTER_VALLEY_ENV`,
  `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_URL`, `ADMIN_ACTION_SECRET`,
  `MOLLIE_API_KEY`, `RESEND_API_KEY`, `SITE_URL`, `FORM_NOTIFICATION_FROM`,
  `VERSEL_RESEND_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`.
- Preview: `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_URL`,
  `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`, `ADMIN_ACTION_SECRET`, `SITE_URL`,
  `MOLLIE_API_KEY`, `FORM_NOTIFICATION_FROM`.
- Development: no names were returned.

No values were requested or displayed. Gaps versus `.env.example` are not automatically defects:
some keys are optional or intentionally Production-only. The Preview `MOLLIE_API_KEY` mode and the
separation of same-named Preview/Production Supabase values remain human verification gates.

The Supabase read-only connector returned Staging `cdmocdodehjmcgtxicaj` and Production
`epqpeoubkbftcvxjbqeo`, matching repository documentation. A branch-metadata request failed in the
connector before returning state, so “no Supabase Branching” is the adopted policy, not a live
dashboard fact proven by this inventory.

## Future read-only Supabase Staging MCP

Do not configure Production. In a separately approved interactive task:

1. Put `mcp_oauth_credentials_store = "keyring"` in the user-level
   `~/.codex/config.toml`; credential storage is machine-local.
2. Add this disabled server to the trusted repository's `.codex/config.toml`:

   ```toml
   [mcp_servers.supabase_staging]
   url = "https://mcp.supabase.com/mcp?project_ref=cdmocdodehjmcgtxicaj&read_only=true&features=database%2Cdebugging"
   auth = "oauth"
   enabled = false
   default_tools_approval_mode = "prompt"
   enabled_tools = ["list_tables", "list_extensions", "list_migrations", "get_logs", "get_advisors"]
   ```

3. Review that the URL contains exactly the Staging ref and `read_only=true`, that account,
   functions, development, branching and storage feature groups are absent, and that write tools
   are not allow-listed.
4. Only then set `enabled = true` and run `codex mcp login supabase_staging` in a normal interactive
   terminal. Complete OAuth as Pascal and verify `codex mcp get supabase_staging`.
5. Stop if the consent screen, project scope, keyring storage or tool list differs. Never accept
   broader scopes and never substitute the documented Production project.

This task stopped before config creation and OAuth because authentication is external state and the
connector cannot itself prove the eventual consent screen and OS-keyring result.

### Disable, remove and revoke

These steps require a separately approved interactive task. Configuration removal and OAuth
revocation are different actions.

1. Inspect configured servers with `codex mcp list` and the exact entry with
   `codex mcp get supabase_staging`. Stop if another project, broader feature group or unexpected
   consent scope appears.
2. First set only `[mcp_servers.supabase_staging].enabled = false` in the trusted repository config,
   then repeat both read-only checks.
3. Run `codex mcp logout supabase_staging` to remove Codex's stored authentication for this server.
   This does not prove that the OAuth provider-side grant is revoked.
4. Run `codex mcp remove supabase_staging` only when that command manages the entry in the active
   Codex configuration. If the block was manually added to `.codex/config.toml`, remove exactly the
   `mcp_servers.supabase_staging` block in the approved repository change instead; do not edit other
   servers.
5. Run `codex mcp list` again. `codex mcp get supabase_staging` must report that the server is no
   longer configured. Inspect the repository config to confirm no active Supabase MCP block remains.
6. If provider-side revocation is required, Pascal must revoke the specific Codex/Supabase OAuth
   grant in the relevant account security UI. Re-run login only after rechecking the Staging-only
   consent. Stop rather than guessing when provider-side grant identity is unclear.
7. Confirm no Production server or Production project ref was added at any point.

The commands above were verified as available in `codex-cli 0.145.0`; none is executed by normal
repository verification.
