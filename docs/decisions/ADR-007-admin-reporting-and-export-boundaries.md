# ADR-007: Admin reporting and controlled export boundaries

**Status:** Accepted for A4 implementation; remote migration and release require separate approval.

## Decision

Admin reporting and CSV exports are manager-only, server-authorized capabilities over Custom Drop
Operations data. Aggregate financial values are derived in PostgreSQL from one canonical,
provider-confirmed paid payment per order and are grouped by currency. They are operational gross
paid figures, not accounting, tax or net-revenue statements. Refund reporting remains unavailable
until a provider-verified refund contract exists.

Exports use fixed report types and column allowlists, an explicit period of at most 90 days, a hard
2,000-row limit, an actor/request/content-bound confirmation step, formula-injection neutralisation
and append-only minimized audit history. The database rechecks the preview fingerprint in the export
transaction. Personal contact/address data, invitation credentials, provider identifiers, tracking
values, metadata and audit payloads are excluded.

`record_origin = test|internal_pilot` is excluded by default from customer reporting. Inclusion is an
explicit manager filter and is recorded in the export audit. Destination-country reporting uses the
order shipping country only and is not inferred from reservation contact-country data.

## Security consequences

The browser receives no service-role credential and cannot select tables, columns, SQL, sort order or
filenames. Reporting RPCs recheck the manager role, use a restricted `search_path`, are revoked from
`PUBLIC`, `anon` and `authenticated`, and are granted only to `service_role`. Export audits contain
actor, export type, minimized filters and record count, never exported rows.

The Vercel boundary is one manager-only `/api/admin/reporting` function with fixed `report`,
`export_preview` and `export_download` operations. Consolidation changes only routing: every request
still verifies the active manager before any operational RPC and preserves JSON/CSV response types,
no-store headers, confirmation fingerprints, row limits and audit behavior.

## Limitations

Historical custom rows identify products by `drop_slug`; migration to immutable `product_code` is a
separate parity decision. Reports are not combined with WooCommerce. No Production migration,
deployment, record change, email or payment is authorized by this ADR.
