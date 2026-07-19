# Codex Cloud task: Admin Backend, Auth and Data Foundation (A1)

## Task identity

Repository: `Professor2080/poster-valley-kickoff-site`. Base branch: `main`. Create branch `codex/admin-backend-auth-data`; open draft PR **A1: Admin auth, roles and data contracts**. Goal: establish secure, additive custom-admin authorization, data/API contracts and tests; do not build operational dashboard actions.

## Current context and approved decisions

The Vite/React site uses Vercel functions and a single Supabase schema with custom interests, invitations, orders and Mollie payments. Current admin code is only a header-secret invitation sender. Accepted ADR-001 through ADR-006 require Supabase Auth magic links, Pascal as initial sole manager, strict custom/Woo ownership, custom-only preorder, server-authoritative shipping during migration, `shop.postervalley.nl`, immutable SKU `eurofighter-typhoon-a2`, and staging-only development/migrations. Customer emails in v1 are invitation, paid-order confirmation and shipping confirmation; ready-to-pack/packed are internal; manager-approved manual quotes need expiry.

## Prerequisites, ownership and scope

Start only after accepted ADRs are frozen and **Poster Valley Kickoff Staging** exists with non-production credentials supplied by Pascal. Own `api/admin/**`, required narrowly scoped `api/_*.js` helpers, `supabase/**`, backend tests and A1 documentation. Do not modify `src/**` (except an agreed shared contract), public API/payment/Mollie/email flows, `docs/workstreams/woocommerce-*`, Vercel settings, production configuration or production data.

Implement additive, compatibility-reviewed migration files only (never execute production migrations): admin role allowlist/RLS/server JWT verification; product registry; immutable audit/entity event contracts; paginated read-only admin APIs; status transition authorization. Include forward migration, rollback notes, historical backfill/compatibility plan, indexes and RLS review. Preserve webhook/provider payment authority; no endpoint may mark unpaid payment paid. Use idempotency/correlation keys for future action contracts.

## Safety restrictions

Allowed: repository inspection, local/staging-safe code/migrations/tests/docs, draft PR. Forbidden: production Supabase access, Production service-role key, production migration, deploy, merge, secrets in logs, real email, Mollie payment, Woo/WordPress install or hosting action. Staging test data must be identifiable/removable; it must never send real mail or create live Mollie payments.

## Validation, handoff and done

Run `npm ci`, `npm run lint`, `npm test`, `npm run build`, `git diff --check`, conflict-marker scan, plus authorization/unauthorized/non-admin/idempotency and staging migration/RLS checks. Handoff: contract/version notes, migration/rollback/backfill instructions, endpoint examples, staging evidence and frontend/QA blockers. Final report must list files, decisions honored, tests, staging evidence, unresolved risks, and explicit no-production-action confirmation. Done means a reviewable scoped draft PR passes checks, no production action occurred, and A2/QA can consume a frozen contract.
