# A2 admin frontend: Preview and staging runbook

## Boundary and prerequisites

This runbook is for human post-review validation only. Codex Cloud must not connect to either Supabase project, run migrations, create users, send a magic link, create a payment, deploy, or touch WooCommerce/WordPress. Use **only** Poster Valley Kickoff Staging (`cdmocdodehjmcgtxicaj`). Stop immediately if any CLI or console target is Production (`epqpeoubkbftcvxjbqeo`). A1's migrations and API contracts are frozen; this frontend requires no migration.

## Preview configuration

1. In the Preview environment only, set `VITE_SUPABASE_URL` to the Staging project URL and `VITE_SUPABASE_PUBLISHABLE_KEY` to its publishable/anon key. These values are browser-safe; the publishable key is **not** a service-role key.
2. Retain the existing server-side **staging** variables required by A1 (`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`) in Preview only. Never prefix a service-role key with `VITE_`, commit it, or expose it in browser code.
3. Redeploy the Preview after any environment-variable change; Vite bakes `VITE_` values into the browser build. Confirm Production variables and Production deployment remain unchanged.
4. Open `/admin` directly. It has no public-site navigation entry.

## Approved identity setup (human approval required)

1. After explicit approval, create/activate Pascal's Staging Supabase Auth identity, exactly `studio@postervalley.nl`, using the approved console procedure. Do **not** use email or metadata to authorize access.
2. Obtain and record the immutable Auth UUID privately. Only then insert exactly one active `admin_roles` row using that UUID and `role='manager'`. Pascal and this identity are one manager, not two admins.
3. Do not send a real magic link during setup. A later real magic-link test needs explicit approval.

## Preview/staging verification

Capture browser screenshots, the Preview deployment URL/commit, sanitized network status codes, role values, and cleanup evidence.

1. With no session, confirm `/admin` shows sign-in and makes **no** protected `/api/admin/read` request.
2. After approval, request a real magic link with Pascal's staging identity. Confirm the neutral check-email message does not disclose admin status and repeat submission is prevented while requesting.
3. Complete the callback at `/admin/callback`; confirm the session is restored, `/api/admin/status?operation=authorization` receives `Authorization: Bearer <access token>`, and the server-verified `manager` role is displayed. The former `/api/admin/authorization` URL is retained only as a compatibility rewrite.
4. Confirm each read-only section (Overview, Reservations, Invitations, Orders, Payments, Events, Products) calls only `GET /api/admin/read` with `resource`, bounded `limit`/`offset`, and its documented equality filters. Confirm visible tables/details contain only contract fields and no write controls.
5. Create a removable `A2-STAGING-DELETE-` non-admin fixture. Sign in, confirm 403 produces “No admin access”, data is not loaded, and logout works.
6. Create a removable approved operator fixture if authorized. Confirm operator and manager both read records, and that changing/expiring/revoking a session returns safely to sign-in on the next request.
7. Test keyboard navigation: skip link, section navigation, form labels, filters, pagination buttons, detail close button, focus visibility, and a 320px-wide viewport without horizontal page overflow.
8. Delete/revoke all `A2-STAGING-DELETE-` fixtures and any temporary role records. Record cleanup counts. Do not use customer data, send customer email, create Mollie payments, or invoke WooCommerce/WordPress.

## Known A2 limitation / A4 handoff

Overview totals are bounded `limit=1` read-contract page totals, not accounting metrics. A2 deliberately shows no revenue, export, reporting, or cross-page single-record query. Detail panels render only fields in the currently loaded page because A1 provides no single-record endpoint; richer reporting/details require a separately reviewed A4 contract.
