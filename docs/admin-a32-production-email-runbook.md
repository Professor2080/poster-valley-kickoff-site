# A3.2 Production invitation email handoff

Invitation delivery is server-only and fails closed. Local development, automated tests, Vercel
Preview, and the isolated Staging project always suppress operational invitation mail. No migration
or environment change is performed by this workstream.

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

The repository previously used `Poster Valley <studio@auth.hetprojectmakersbureau.nl>` for general
application mail. Repository text is not evidence of current Resend DNS verification. Before release,
an owner must verify the exact domain used by `OPERATIONAL_EMAIL_FROM` in the Resend dashboard and
confirm that the address is permitted. No API key or DNS value should be pasted into a PR or chat.

## Release order and checks

1. Review and apply `20260721151023_admin_invitation_delivery_confirmation.sql` through the normal
   human-approved migration workflow after isolated validation.
2. Configure the Production-only variables above. Leave Preview and Staging with
   `POSTER_VALLEY_ENV=staging` (or unset) and delivery disabled.
3. Confirm Admin Overview reports that Production invitation delivery is enabled without displaying
   values.
4. Preview a newly created synthetic/approved reservation and verify the masked destination, design,
   external effect and irreversibility text before confirming.
5. A real-email smoke test requires separate approval. Use only `studio@postervalley.nl` (or another
   explicitly approved address), send at most one clearly labelled invitation, and do not create a
   payment or alter an existing customer record.

A `sent` delivery status means Resend accepted the API request and returned a validated message ID;
it is not proof of inbox delivery. A timeout or concurrent idempotency response remains `pending` for
reconciliation. Attempts older than the provider's 24-hour idempotency window are not blindly resent.
