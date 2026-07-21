# A3.1 — Admin customer data and record origin

Status: implementation proposed in Draft PR; migration not applied remotely.

## Scope

A3.1 makes existing commerce records identifiable and fulfilment-safe without starting A4 reporting. It adds privacy-minimized Admin lists, manager-only customer detail, durable record-origin classification, and address completeness controls.

## Customer-data boundary

- Reservation lists expose customer name and a server-generated masked email.
- Order lists expose customer name, order/payment/fulfilment state, destination country, and dates. They never expose a street address.
- Complete reservation email and complete order shipping data are available only from the manager-authorized `POST /api/admin/detail` contract.
- Admin reads use fixed server projections, bounded results, private no-store responses, and no browser-direct database reads.
- Linked record IDs and invitation API tokens are sent in JSON request bodies rather than query strings.
- Database failure bodies are not copied into application logs or public errors.

Managers can perform existing operator actions. Operators retain lifecycle list/history access but do not receive complete email or shipping detail because no accepted ADR explicitly grants that PII access.

## Address audit

The existing order schema already stored recipient name, customer email, address lines 1 and 2, postal code, city, optional region, country name, and ISO country code. A3.1 adds only the missing optional `shipping_company`. No phone field is added because the current shipping workflow has no carrier requirement for one.

Shipping data remains checkout-only. The reservation handler continues to force the legacy `shipping_address` field to `null` and ignores arbitrary client address/origin properties.

Checkout validation now uses a server-owned ISO country allowlist, rejects control characters, validates common NL/US/CA/AU/GB postal formats, accepts a restrained international fallback, and requires region for US, Canada, and Australia. Existing automatic shipping and approved manual-quote destinations remain authoritative.

No address-edit operation is introduced. Once a Mollie payment is provider-confirmed, a database trigger makes shipping identity/address fields immutable. A future address-correction workflow requires a separately accepted, audited business operation.

Entering or retrying `shipped` requires a complete stored destination, carrier, and tracking number. Reservation contact data is never treated as a shipping destination.

## Record origin

`drop_interest_requests.record_origin` is the canonical root with constrained values:

- `customer`
- `test`
- `internal_pilot`

Invitations, orders, payments, fulfilment, quotes, email history, and future exports derive origin through existing foreign-key lineage. `operational_email_attempts.interest_request_id` closes the email lineage without rewriting immutable delivery/audit history.

Future public reservations explicitly persist `customer` with no review flag. The public handler does not accept a trusted origin input. Test and internal-pilot fixtures must set their origin through trusted server/test setup.

### Conservative legacy strategy

Existing records start as `customer` with `record_origin_needs_review = true`. Only email domains in the reserved `.test` namespace are automatically proven as `test`. Ordinary providers are never treated as evidence. Public `source_path`, including `/internal-live-pilot`, is not trusted for classification by itself, so those records remain for manager review unless separately verified.

## Manager origin operation

Origin changes use a non-mutating preview followed by `CONFIRM`. The request requires a bounded reason and expected origin version. The mutation:

1. requires an active manager role;
2. serializes the idempotency key;
3. locks and version-checks the reservation;
4. updates the canonical origin and clears review state;
5. records minimized immutable audit/entity history; and
6. completes the idempotency result in the same transaction.

The audit stores actor, previous/new origin, previous/new review state, versions, reason, and affected record counts. It stores no name, email, address, token, or row snapshot.

## A4 preparation

Reservation, invitation, order, and payment lists support exact origin filtering and an `exclude_origin` filter. This lets future reports exclude `test` and `internal_pilot` chains without building A4 in this workstream.

## Limitations

- The migration must be reviewed and applied through the normal environment promotion process; Codex did not apply it to Staging or Production.
- Docker and a local PostgreSQL runtime were unavailable in this workspace, so the migration received source-contract regression coverage but was not executed against a local database.
- Address correction after provider-confirmed payment is intentionally unavailable.
- Phone is intentionally absent until a selected carrier proves it is required.
- No full reporting/export UI is included; only origin-safe list/export contract groundwork is present.
