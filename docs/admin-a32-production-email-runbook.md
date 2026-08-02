# Production operational email handoff

Invitation and shipping-confirmation delivery are server-only and fail closed. Local development,
automated tests, Vercel Preview and Clean Staging always suppress operational customer mail. Legacy Staging is inactive,
frozen and not a feature-validation target. No migration or environment change is performed by this
workstream.

## Required Production configuration

Set these as Vercel **Production-only**, server-side variables:

```text
VERCEL_ENV=production                         # supplied by Vercel
POSTER_VALLEY_ENV=production
OPERATIONAL_EMAIL_DELIVERY_ENABLED=true
RESEND_API_KEY=<secret>
OPERATIONAL_EMAIL_FROM=Poster Valley <studio@<verified-sender-domain>>
OPERATIONAL_EMAIL_REPLY_TO=studio@postervalley.nl
SITE_URL=https://www.postervalley.nl
ADMIN_INVITATION_TOKEN_SECRET=<independent high-entropy secret>
ADMIN_CONFIRMATION_SECRET=<independent high-entropy secret, at least 32 characters>
```

Do not reuse the Supabase service-role key for either application secret. Do not prefix any variable
with `VITE_`. `FORM_NOTIFICATION_*` continues to configure the older reservation/internal mail path;
it does not enable A3.2 invitation delivery.

The same gate and sender identity apply to the versioned `order_invitation` and
`shipping_confirmation` templates. No other template is accepted by the operational provider
adapter. A shipping confirmation contains the design title, carrier and tracking number, but no
customer address, payment data or invitation token.

The repository previously used `Poster Valley <studio@auth.hetprojectmakersbureau.nl>` for general
application mail. Repository text is not evidence of current Resend DNS verification. Before release,
an owner must verify the exact domain used by `OPERATIONAL_EMAIL_FROM` in the Resend dashboard and
confirm that the address is permitted. No API key or DNS value should be pasted into a PR or chat.

## Release order and checks

1. Validate the A3.2 contract as part of the canonical
   `20260731113000_schema_baseline_v1.sql` apply to empty Clean Staging. The former
   `20260721151023_admin_invitation_delivery_confirmation.sql` is archive provenance and must not be
   applied independently. Validate `20260802130000_shipping_confirmation_safety.sql` only after the
   canonical baseline and default-privilege hardening. Existing Production requires a separately
   approved read-only compatibility check and additive DDL; never run the initial baseline DDL there.
2. Configure the Production-only variables above. Leave Preview and Staging with
   `POSTER_VALLEY_ENV=staging` (or unset) and delivery disabled.
3. Confirm Admin Overview reports that Production operational email delivery is enabled without
   displaying values.
4. Preview a newly created synthetic/approved reservation and verify the masked destination, design,
   external effect and irreversibility text before confirming.
5. A real-email smoke test requires separate approval. Use only `studio@postervalley.nl` (or another
   explicitly approved address), send at most one clearly labelled invitation, and do not create a
   payment or alter an existing customer record.
6. Shipping-email validation normally remains suppressed and uses a synthetic paid-order fixture in
   Staging. A Production shipping-email smoke test additionally requires an explicitly approved
   rollback-safe synthetic order and separate authorization; never repurpose a customer order.

A `sent` delivery status means Resend accepted the API request and returned a validated message ID;
it is not proof of inbox delivery. A timeout or concurrent idempotency response remains `pending` for
reconciliation. A successful provider response without a valid message ID has the same ambiguous
outcome. Admin returns HTTP `202` with `reconciliationRequired = true`, exposes that state in order
list and detail reads, and blocks normal retry. Attempts older than the provider's 24-hour idempotency
window are likewise not blindly resent.

For such an attempt, a manager must verify the provider outcome outside Admin before choosing the
contextual reconciliation action. Record exactly one outcome:

- `provider_acceptance_confirmed`: close the existing attempt as `sent`. This confirms provider
  acceptance only; `inbox_delivery_confirmed` remains false.
- `provider_non_acceptance_confirmed`: close the existing attempt as `failed`. A fresh manager
  preview and new retry key may then prepare a new attempt.

The evidence note must be a short operational statement and must not contain customer contact/address
data, provider IDs, secrets, tokens or links. Reconciliation itself sends no email and does not change
payment state, fulfilment state or fulfilment version. Repeating the same reconciliation key safely
replays the recorded result; changing its outcome with that key conflicts.

A definitive provider failure leaves the order shipped, records `failed`, and requires a fresh
manager preview plus a new retry key. Repeating the same confirmed retry safely replays its recorded
result and never sends a second provider request. Stored legacy carrier and tracking values are
revalidated under database locks before any retry payload is released.
