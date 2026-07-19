# Admin Dashboard v1

## Scope and guardrails

V1 is an authenticated operations console for **custom** records only. It is not Woo admin, a generic CRM, freeform email editor, accounting system, or stock manager. Read-only dashboard/list/detail capability precedes operational writes. Templates are versioned code/config with preview; v1 offers template selection/preview and event history, not arbitrary HTML editing.

Views: period-filtered dashboard (reservation counts/product, draft/sent/open invitations, open/paid/failed payments, paid-to-fulfil, shipped/completed, paid-only revenue, conversion); reservation list/detail/search/filter with notes/timeline; orders with totals/address/Mollie reference/payment and fulfilment filters; shipping profiles/rules/manual quotes; email template preview/history/resend safeguards; reports and CSV exports. Exports are permissioned, audited and use paid orders only for revenue/AOV.

## Authentication and authorization

Use Supabase Auth magic link (or another approved secure provider flow), an explicit `admin_roles` allowlist keyed to `auth.users.id`, short-lived verified sessions, server-side JWT verification, and RLS. Browser requests use the user session; privileged server routes verify identity/role then perform narrowly scoped action. Service-role credentials remain server-only and never substitute for user authorization. The existing `ADMIN_ACTION_SECRET` may remain a temporary integration secret only; it is not a dashboard login and should not authorize dashboard endpoints.

Roles: `operator` reads and performs approved operational transitions; `manager` additionally manages shipping rules/manual quotes and exports; a future `owner` manages roles. No role can mark a payment paid.

## Status contract

| Entity | States and transitions | Actor |
| --- | --- | --- |
| Reservation | `new -> reviewed -> invitation_draft -> invitation_sent -> converted`; `new/reviewed/invitation_draft/invitation_sent -> cancelled`; `reviewed -> closed` | operator; invitation creation/send also records audit |
| Invitation | `draft -> sent -> opened -> order_started -> payment_open -> paid`; `draft/sent/opened/order_started/payment_open -> expired/cancelled` | send: operator; opened/order-started: public route; payment-open/paid: payment flow/webhook; expiry: server job/request evaluation |
| Payment | `created -> open -> paid|failed|expired|canceled`; `paid -> refunded` only after a provider-verified refund integration | Mollie/webhook/provider reconciliation only. Admins cannot set paid. |
| Fulfilment | `unfulfilled -> ready_to_pack -> packed -> shipped -> completed`; pre-shipment states may go to `cancelled`; shipment corrections require manager confirmation/audit | operator/manager |

Current schema uses reservation `new/contacted/order_invited/converted/cancelled` plus legacy `status`; order `draft/awaiting_payment/payment_open/paid/payment_failed/payment_expired/cancelled/shipped`; payment lacks `refunded`. A1 must map/backfill deliberately, retain compatibility during rollout, and never silently reinterpret historical rows.

Payment paid, failed, expired and canceled transitions are webhook/provider-authoritative. `sent` email transitions happen after an idempotent send claim; payment confirmation occurs once after paid; shipping confirmation is opt-in per transition and requires tracking/carrier data or a consciously approved no-tracking exception. Sending/resending, canceling, manual quote acceptance, shipping-rate changes and completion require confirmation dialogs appropriate to impact.

## Proposed data additions (no migration executed here)

| Addition | Purpose/source/access/RLS/index/risk | Phase |
| --- | --- | --- |
| `admin_roles` | auth-user role allowlist; sensitive identity metadata; own-row read, server role checks; PK `user_id`, role index; low migration risk | A1 |
| `admin_audit_events` | immutable actor/action/entity/before-after/correlation/IP policy; admin-only/server insert; `(entity_type,entity_id,created_at)` and actor/date indexes; PII minimization | A1 |
| `entity_events` | append-only business timeline, including webhook/system events; no browser direct writes; entity/date index; avoid duplicating mutable truth | A1 |
| `internal_notes` | operator notes on reservation/order; admin-only, author/date/entity indexes; sensitive operational data | A2/A3 |
| `email_events` | provider/template/version/recipient redacted status/idempotency key; server-only insert, admin read; unique action key + entity/date index | A3 |
| `product_registry` | custom public lifecycle/product-code/custom config/Woo link reference; manager writes, public-safe projection; unique product code and mode index; moderate backfill | A1 |
| `shipping_profiles`, `shipping_rate_rules` | server-authoritative versioned profile/rules; manager write, server quote read; profile/active/country indexes; high pricing migration risk | A3 after parity |
| `manual_shipping_quotes` | quote amount/currency/expiry/approval snapshot; admin-only; invitation/status/expiry indexes; money/PII sensitive | A3 |
| order fulfilment fields/events | `fulfilment_status`, tracking, shipped/completed timestamps plus timeline; admin/server guarded; status/date indexes; backfill only after contract | A3 |

Keep addresses and emails restricted to authorized staff, redact exports/logs, use server pagination and field allowlists, and snapshot monetary/shipping data on paid/custom orders. Retention, deletion and legal bases require Pascal/legal confirmation.
