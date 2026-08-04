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
| Interest | Processed and no invitation has been demonstrably sent. This remains the active phase whether or not the drop threshold has been reached. |
| Awaiting payment | An invitation has been sent/opened/started or an order is in a non-paid payment lifecycle. Mollie/webhook updates move this automatically. |
| Paid · to ship | Order status is `paid` and a Mollie payment has status `paid`, provider ID, webhook timestamp, paid timestamp, exact order total and currency. |
| Shipped | The same paid evidence exists and fulfilment is `shipped`. |
| Closed | A manager confirmed delivery and then explicitly closed the item. Closed cards are excluded by default and remain searchable. |

Cancelled, expired, failed, duplicate-invitation, origin-review, shipping-email and reconciliation
conditions remain visible through `Needs attention`; they are not silently hidden or repaired. An
unsent Interest card also derives Attention when its drop threshold is reached. That status is
computed from current threshold, count and delivery evidence rather than stored permanently, so it
disappears as soon as that card's invitation is successfully sent. A failed or suppressed delivery
continues to receive Attention and remains in Interest for a safe retry.

## Actions and authority

- `Process` is operator-safe and writes only `admin_order_flow_state`. The server derives the next
  phase; the browser cannot submit a target phase.
- `Send invite` is always available to a manager on an eligible Interest card. It reuses the
  existing invitation preview/confirm/send action, including server-owned price, shipping, expiry,
  idempotency, role and delivery safeguards. Below threshold, the confirmation explicitly shows
  `Threshold not reached: X/Y interests. Send invite anyway?`; a missing threshold is disclosed but
  does not block the action. Only a provider-accepted delivery moves the card to Awaiting payment.
- `Set threshold` and `Edit threshold` live in the drop overview. The manager-only mutation is
  confirmation-bound, version-checked, idempotent and audited; it changes only the selected
  product's stored threshold.
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

The board migration maps the existing canonical product to `eurofighter-typhoon`. The additive
threshold-default migration then configures `eurofighter-typhoon-a2` explicitly with a production
threshold of `5` and makes `5` the database default for every newly inserted product registry row.
An insert trigger also normalizes an explicitly supplied `NULL` to `5`, so an authorized current or
future server-side creation path cannot accidentally bypass the default. A deliberate non-null
per-drop value remains unchanged, allowing a manager-authorized creation flow to configure an
exception.

`production_threshold` remains nullable at the schema level. Existing historical rows with `NULL`
are not bulk-filled, and updates can preserve that legacy state; making the column `NOT NULL` would
therefore be an unsafe compatibility contraction. The migration updates no existing threshold
except Eurofighter A2. If historical invitations already exist when the board migration is applied,
their earliest timestamp still proves that invitations were already open and the product lifecycle
is preserved as `preorder`.

The drop overview, cards and invitation preview all consume the stored threshold returned by
`admin_order_flow_drop_v1`. For Eurofighter this yields `X / 5 interested`, the corresponding
`Z more needed`, or `Threshold reached`, without a frontend-specific threshold constant. A
historical missing value is shown as `Threshold not configured` with a reachable Set threshold
action. The qualified-unit filter is unchanged: only customer-origin, reviewed, non-cancelled
reservation quantities count. Counts and thresholds remain isolated by the canonical drop mapping.

The removed `Ready to invite` phase is retained only as database-level compatibility for older
clients and already-published lifecycle actions. The current read RPC rejects it as an active stage,
the current projection folds any legacy `preorder` item into Interest until invitation evidence is
present, and the browser defensively folds a stale legacy response into Interest during a
database-first rollout.

The board derives historical Process evidence from existing downstream states so already handled
records do not regress into New. A newly submitted interest has no such evidence and requires the
explicit Process action.

## Verification and release

`supabase/tests/order-flow-board-contract.sql` proves New-until-Process, under-threshold and
reached-threshold invitations, failed-versus-successful delivery progression, derived Attention,
missing-threshold compatibility, threshold administration, exact paid evidence, provider event
creation, Shipped, delivery confirmation and Closed archive behavior inside a rolled-back local fixture. The baseline runner
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
