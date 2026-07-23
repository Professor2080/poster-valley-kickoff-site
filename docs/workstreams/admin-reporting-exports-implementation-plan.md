# A4 Admin reporting and controlled exports — implementation plan

## Scope and source precedence

This plan implements [the accepted A4 brief](admin-reporting-exports.md) on top of merged A1–A3.2.
It does not change payment/webhook, invitation delivery, fulfilment transitions, public routes,
WooCommerce, Resend, Mollie or Production configuration. The implementation is additive and is not
authorization to apply a migration to any remote environment.

The custom Drop Operations database remains the only reporting source. WooCommerce data is not
copied, combined or edited. Pascal's active `manager` allowlist row is the only initial access path.

## Metric contract

All stored timestamps are UTC `timestamptz`. API period filters are half-open intervals:
`from <= timestamp < to`. The Admin UI submits ISO-8601 UTC boundaries and displays the selected
calendar dates. Presets are trailing 7, 30 and 90 UTC days; `all` omits the lower boundary for the
aggregate report. A custom reporting period is limited to 366 days. CSV exports require an explicit
period of at most 90 days.

| Metric | Definition | Timestamp |
| --- | --- | --- |
| Reservations | Count of reservation rows. | `drop_interest_requests.created_at` |
| Invitations sent | Distinct invitations with a confirmed `sent_at`; retries do not add another invitation. | `order_invitations.sent_at` |
| Orders started | Count of custom order rows. | `orders.created_at` |
| Paid orders | Distinct orders with at least one provider-confirmed, amount/currency-matching Mollie payment. | canonical payment `paid_at` |
| Paid gross revenue | Sum of `orders.total_amount`, once per paid order, grouped by `orders.currency`. | canonical payment `paid_at` |
| Average order value | Paid gross revenue divided by distinct paid orders, per currency. | canonical payment `paid_at` |
| Reservation → invitation | Reservations created in the period that have a confirmed-sent linked invitation, divided by reservations created in the period. | reservation cohort `created_at`; invitation state as of query time |
| Invitation → order | Confirmed-sent invitations sent in the period that have a linked order, divided by confirmed-sent invitations sent in the period. | invitation cohort `sent_at`; order state as of query time |
| Order → paid | Orders created in the period that have a valid paid payment, divided by orders created in the period. | order cohort `created_at`; payment state as of query time |
| Open fulfilment | Valid paid orders whose fulfilment status is not `shipped`. | canonical payment `paid_at` |
| Fulfilment attention | Open fulfilment in `ready_to_pack` or `packed`, or an address-completeness failure; plus shipped orders whose shipping email is `failed`. | canonical payment `paid_at` |
| Invitation delivery open/failed | Latest delivery attempt per invitation with status `pending` or `failed`. | invitation `sent_at` when present, otherwise invitation `created_at` |

A valid paid payment requires all of: provider `mollie`, status `paid`, a non-empty provider payment
ID, non-null webhook and paid timestamps, and exact amount/currency equality with its order. A single
canonical payment row is selected per order, ordered by `paid_at`, `created_at`, then payment ID. This
prevents retries or replayed webhook records from counting an order twice.

The current custom flow supports EUR, but the report contract still groups monetary results by
currency and never adds different currencies together. Refunds are not represented reliably in the
current payment status contract. A4 therefore labels revenue **paid gross revenue**, excludes all
non-paid statuses, and makes no net-revenue, tax or accounting claim.

Product filters use the existing immutable `drop_slug` lineage because historical custom rows do not
yet store `product_registry.product_code`. Destination-country filters apply only to order, payment,
revenue and fulfilment measures using `orders.shipping_country_code`; reservation/invitation counts
are not silently treated as shipping destinations. The UI explains this metric-level applicability.
Test and internal-pilot lineages are excluded by default; managers may deliberately include them.

## Server and database design

1. Add service-role-only `SECURITY DEFINER` RPCs for the aggregate report, export preview and export
   data. Every RPC rechecks an active `manager` row and uses a restricted `search_path`.
2. Revoke execution from `PUBLIC`, `anon` and `authenticated`; grant only `service_role`.
3. Keep browser requests behind the manager-authorized `POST /api/admin/reporting` Vercel endpoint.
   Its operation, filters and export types use fixed allowlists; no client-controlled table, column,
   SQL fragment, sort or filename is accepted.
4. Select a canonical valid paid payment once per order inside the database. Return currency buckets
   instead of a single cross-currency total.
5. Audit each completed export in `admin_audit_events` with actor, type, minimized filters, row count
   and the event timestamp. Do not store exported rows or personal data in audit details.

## Export contract

Available export types: `reservations`, `invitations`, `orders`, `payments`, `fulfilment` and
`summary`. Exports require a server-issued, actor/request/state-bound confirmation proof. The server
first previews the row count and a content fingerprint; requests above 2,000 rows are refused and
must be narrowed. The same limit, fingerprint and 90-day maximum are rechecked transactionally
during generation.

Exports intentionally exclude names, full or masked emails, street addresses, postal codes, cities,
invitation tokens/hashes/links, checkout URLs, provider payment IDs, tracking numbers, internal JSON
metadata, audit payloads, Resend IDs and secrets. Fulfilment exports expose `tracking_present` rather
than the tracking value. CSV uses a UTF-8 BOM, fixed column order, RFC-style quote escaping and an
apostrophe prefix for text cells beginning (after whitespace) with `=`, `+`, `-` or `@`.

## Implemented files

- `supabase/migrations/20260722111632_admin_reporting_exports.sql`
- `api/admin/_reporting.js`, `api/admin/reporting.js`
- `api/admin/status.js` plus compatibility rewrites for the two retired read-only status routes
- `src/admin/reporting.ts`, `src/admin/AdminApp.tsx`, `src/admin/api.ts`, `src/index.css`
- focused A4 API, SQL-contract, CSV, metric and UI tests
- ADR-007 and `docs/admin-a4-reporting-runbook.md`

## Verification and release gates

Run `npm ci`, lint, the full Node test suite, build, `git diff --check`, conflict/secret/browser-write
scans and desktop/mobile/keyboard browser checks. If a local PostgreSQL runtime is unavailable, SQL
execution, query plans, RLS and advisors remain a separately authorized Staging gate. Production,
email delivery, Mollie calls, Vercel variables, deployment and merge remain explicitly out of scope.
The deployable handler inventory must remain at or below the Vercel Hobby limit of 12; A4's combined
reporting route and the combined read-only admin-status route bring the inventory from 14 to 12.
