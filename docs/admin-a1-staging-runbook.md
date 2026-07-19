# A1 admin foundation: staging runbook and A2 contract handoff

## Scope and identity

This repository change is local only. It creates one additive migration, `supabase/migrations/20260720090000_admin_auth_data_foundation.sql`; it has **not** been executed remotely. ADR-001's sole initial manager is Pascal. `studio@postervalley.nl` is Pascal's approved Supabase Auth login identity, not a second manager. No operator or other manager is approved initially.

Admin authentication uses an `Authorization: Bearer <Supabase access token>` verified at Supabase Auth's `/auth/v1/user` endpoint. The server then uses its server-only key to look up an active `admin_roles` allowlist row. Email and `user_metadata` are never authorization inputs; `ADMIN_ACTION_SECRET` remains unrelated legacy sender protection. Invalid/expired tokens return `401`; authenticated users without an active row return `403`; permissions deny by default. Auth session expiry and revocation take effect on the next request: revoke/expire the Supabase session and set `revoked_at` on the role row. Do not put a service-role key in a browser or repository.

## A2 read contract (v1)

`GET /api/admin/read?resource=reservations|invitations|orders|payments|events|products&limit=25&offset=0` requires operator or manager. Limit is 1–100, offset is 0–100000. Only documented equality filters are accepted per resource; unknown filters are ignored rather than becoming database expressions. Responses are `{version:"v1",resource,items,page:{limit,offset,total}}`; failures are `{error:{code,message}}`. The explicit SQL selects exclude emails, names, addresses, checkout URLs, invitation hashes/tokens, metadata and payment provider IDs. `GET /api/admin/authorization` reports only the caller's role. These are read-only; no A1 endpoint writes payments, orders, invitations, quotes, email, fulfilment, or exports.

The payment list deliberately exposes only safe state/amount/timestamps. Mollie plus verified webhook reconciliation remain authoritative. A future mutation must use an idempotency key and correlation ID, but no A1 endpoint can mark a payment paid or bypass provider state.

## Status compatibility and backfill

Both interest fields remain unchanged in place. Compatibility view for A2 is: `new → new`, `contacted → contacted`, `payment_link_sent → order_invited`, `converted → converted`, and `cancelled → cancelled`. `payment_link_sent` and `order_invited` are semantically close but **not equivalent**: the former means legacy payment-link language while the latter records invitation workflow. A1 performs no automatic backfill or rewrite.

After staging review, reconcile historical rows by reporting mismatches, classifying source evidence (invitation/payment timestamps), and recording a separately reviewed entity event before any correction. Keep both fields through consumer migration; only a later approved migration may establish a canonical status. Invitation (`draft/sent/opened/order_started/payment_open/paid/expired/cancelled`), order (`draft/awaiting_payment/payment_open/paid/payment_failed/payment_expired/cancelled/shipped`), and payment (`created/open/paid/failed/expired/canceled/unknown`) constraints are untouched.

## Migration/RLS/audit design

The migration adds `admin_roles`, append-only `admin_audit_events` and `entity_events`, and `product_registry`. Events have actor, entity, action/type, correlation and optional idempotency fields; callers must keep JSON payloads PII-minimized and never include tokens/secrets. Audit retention is indefinite for v1, provisionally, pending formal legal/privacy retention policy review. Timeline and actor/date indexes support investigation. Update/delete triggers protect history; direct browser writes are denied because RLS is enabled without write policies.

`product_registry.product_code` is immutable lowercase kebab-case. Its lifecycle modes are exactly `interest`, `preorder`, `in_stock`, `sold_out`, and `archived`; a generated, non-editable `commerce_authority` maps them respectively to `custom`, `custom`, `woocommerce`, `none`, and `historical`. `interest` and `preorder` use Custom Drop Operations; `in_stock` uses WooCommerce; `sold_out` has no active purchase authority (a later custom interest feature needs approval); and `archived` is historical/non-purchasable. Optional Woo references are permitted only while a product is `in_stock`; A1 does not contact WooCommerce. The seed `eurofighter-typhoon-a2` is `interest`, because the current public configuration is a reservation-of-interest flow, not a preorder checkout. The registry does not become an editable price/stock/order authority: `api/_drops.js` and server quote logic remain authoritative for custom pricing until a separately approved parity migration.

Forward compatibility: all additions are new objects; no existing table, column, constraint, status, flow, or RLS policy changes. Existing service-role server flows continue. Rollback is a decision, not automatic: first stop A1 writers and export/review new event/role/product data; dropping tables would discard newly written records and is unsafe after use. Prefer a forward corrective migration.

## Post-review staging procedure (only project `cdmocdodehjmcgtxicaj`)

1. Prerequisite: an authenticated human has reviewed this PR, has staging-only credentials, and has confirmed `supabase projects list` shows **exactly** ref `cdmocdodehjmcgtxicaj`. Stop if it shows `epqpeoubkbftcvxjbqeo` (Production) or any other ref. Never use Production credentials.
2. Apply exactly `20260720090000_admin_auth_data_foundation.sql` after the recorded initialization migration `20260719175848_initialize_poster_valley_kickoff_staging`. Capture CLI/project-ref output and migration timestamp. Do not run `db push` against an unchecked target.
3. Verify tables, `admin_role` enum, seed product, product-code check, triggers, indexes, and RLS policies using catalog queries. Confirm protected tables have no browser INSERT/UPDATE/DELETE policy; confirm `admin_roles_read_own` and product authenticated-read policy only.
4. Create removable fixtures prefixed `A1-STAGING-DELETE-`, including a non-admin Auth user and a test role user. Do not use real customer data. Test missing token (401), expired/revoked token (401), non-admin (403), operator read access, and manager access. Test bounded pagination and verify emails/tokens/addresses are absent from API responses.
5. After an approver confirms Auth setup, create Pascal's Auth identity at `studio@postervalley.nl` through the approved Supabase Auth console flow **without sending a magic link during this exercise**, obtain its immutable Auth UUID, and insert one `admin_roles` row with `role='manager'`. Verify the UUID—not email/user metadata—controls authorization. Record no secret in evidence.
6. Do not call invitation, payment, email, Mollie, WooCommerce, or deployment endpoints. Delete all `A1-STAGING-DELETE-` fixtures and revoke/delete their Auth users. Capture cleanup counts, auth/RLS test results, schema/index output, and screenshots/logs suitable for PR evidence.
7. If validation finds a defect before writes, stop and use a forward fix. If audit/events/roles were written, do not drop tables blindly: preserve evidence, assess retention/legal impact, and author a reviewed corrective migration.

No remote migration, email, payment, WooCommerce/WordPress action, or deployment is authorized by this document.
