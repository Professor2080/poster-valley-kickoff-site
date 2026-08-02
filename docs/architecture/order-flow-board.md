# Order Flow Board

Status: implemented on a feature branch; migration not applied remotely.

## Purpose and source boundaries

The Order Flow Board is the default screen in the existing authenticated Poster Valley Admin. It is
an operational projection over the current custom drop records. It does not introduce a second
order system, change WooCommerce ownership, or write payment truth. `source_type` is present in the
contract for a future separately approved shop adapter, but this release only emits `drop` cards.

Every card is rooted in one `drop_interest_requests` row and enriches that root with its latest
invitation, canonical order, latest payment, exact provider-confirmed paid evidence, fulfilment and
a small `admin_order_flow_state` work record. The work record contains only Process, delivery and
archive metadata. Existing reservation, invitation, order, payment and fulfilment states remain the
business source of truth.

## Phase mapping

The server derives one phase, in this precedence order:

| Board phase | Server-owned evidence |
| --- | --- |
| New | No Process work marker and no historical downstream lifecycle evidence. A fresh interest stays here until `Process`. |
| Interest | Processed, while the product lifecycle remains `interest`. |
| Ready to invite | The drop lifecycle is `preorder` and no invitation/payment state has taken precedence. |
| Awaiting payment | An invitation has been sent/opened/started or an order is in a non-paid payment lifecycle. Mollie/webhook updates move this automatically. |
| Paid · to ship | Order status is `paid` and a Mollie payment has status `paid`, provider ID, webhook timestamp, paid timestamp, exact order total and currency. |
| Shipped | The same paid evidence exists and fulfilment is `shipped`. |
| Closed | A manager confirmed delivery and then explicitly closed the item. Closed cards are excluded by default and remain searchable. |

Cancelled, expired, failed, duplicate-invitation, origin-review, shipping-email and reconciliation
conditions remain visible through `Needs attention`; they are not silently hidden or repaired.

## Actions and authority

- `Process` is operator-safe and writes only `admin_order_flow_state`. The server derives the next
  phase; the browser cannot submit a target phase.
- `Open invitations` is manager-only and available only when a configured production threshold is
  reached by customer-origin, non-cancelled, reviewed units. It changes the product lifecycle from
  `interest` to `preorder`; it sends no email. The mutation locks the drop's reservation rows
  before recounting so a concurrent manager origin correction cannot invalidate the threshold
  snapshot.
- `Send` reuses the existing invitation preview/confirm/send action, including server-owned price,
  shipping, expiry, idempotency, role and delivery safeguards.
- `Ship` opens the existing order detail and fulfilment controls. The existing paid-only check,
  carrier/tracking validation and shipping-confirmation path remain authoritative.
- `Confirm delivery` and `Close` are manager-only, version-bound, separately confirmed and audited.
  Delivery confirmation contacts neither carrier nor customer. Close snapshots order and fulfilment
  states in the archive work record.

Every new mutation has a non-mutating preview, short-lived actor/action/payload/state-bound proof,
fresh preview comparison, stable idempotency key, database lock, optimistic version check, audit
event and entity event. The payment trigger adds `payment.paid` only after complete confirmed Mollie
evidence; it never changes a payment.

## Data, access and privacy

`admin_order_flow_state` has RLS enabled and no browser policy. Its table and the two
`security_invoker` views are explicitly revoked from `public`, `anon` and `authenticated`; only the
server role receives the minimum select/RPC grants. Security-definer RPCs use a fixed empty
`search_path` and repeat active-role checks. List cards expose masked email only. Existing manager-
authorized detail endpoints remain the sole path to complete customer and shipping data.

Search is bounded to 120 characters, server-filtered and paginated. The board does not log or add
addresses, payment identifiers, tokens or provider responses.

## Threshold and compatibility backfill

The migration maps the existing canonical product to `eurofighter-typhoon` but deliberately leaves
`production_threshold` null. No fake first-drop goal is invented. If historical invitations already
exist when the migration is applied, their earliest timestamp proves that invitations were already
open; the product lifecycle is preserved as `preorder`. On a fresh database the product remains
`interest`, and `Open invitations` stays unavailable until a manager-approved threshold is
configured through a separately authorized data operation.

The board derives historical Process evidence from existing downstream states so already handled
records do not regress into New. A newly submitted interest has no such evidence and requires the
explicit Process action.

## Verification and release

`supabase/tests/order-flow-board-contract.sql` proves New-until-Process, server-derived progression,
threshold and manager gates, exact paid evidence, provider event creation, Shipped, delivery
confirmation and Closed archive behavior inside a rolled-back local fixture. The baseline runner
applies every active migration twice from `template0`, validates catalog/ACL fingerprints and runs
the permanent contracts.

No migration is applied by a PR or CI. Release remains database-first and requires a separately
authorized PostgreSQL 17 local proof, exact Clean Staging history/dry-run/apply, authenticated
synthetic acceptance and later a separately authorized Production migration. The application must
not be promoted ahead of the backward-compatible database migration.

Rollback before any remote apply is an ordinary PR revert. After an environment applies the
migration, do not edit or delete the migration and do not drop the work table ad hoc: ship a new
reviewed forward migration. Preserve `admin_order_flow_state`, audit events and entity events as
operational history; a UI rollback can stop consuming them without data loss.
