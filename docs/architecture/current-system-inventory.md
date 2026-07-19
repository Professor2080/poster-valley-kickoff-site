# Current custom-commerce system inventory

**Inspection baseline:** `main` commit `7c262441432e91262507f6011bca9b0892fcedc2` (`Merge pull request #8 from Professor2080/codex/plan-poster-valley-commerce-development`). This inventory is evidence for the commerce-program documents; it does not connect to Supabase, Resend, Mollie, Vercel, or any production system.

## Tooling and routes

The project is a Vite 8, React 19 and TypeScript application with Vercel serverless functions. `package.json` defines `dev`, `build`, `lint` (`oxlint`), `test` (`node --test`) and `preview`; the repository currently has `test/send-order-invitation.test.js`.

Client-side routing is path-based in `src/lib/routes.ts`: `/`, `/designs/eurofighter-typhoon`, `/order/:token`, `/privacy`, and `/terms`. There is no admin dashboard route or admin client authentication surface. The current server endpoints are `/api/interest`, `/api/newsletter`, `/api/order-invitation`, `/api/order-quote`, `/api/create-payment`, `/api/mollie/webhook`, and `/api/admin/send-order-invitation`.

## Data and status evidence

`supabase/schema.sql` is the sole schema file. It defines `drop_interest_requests`, `newsletter_signups`, `order_invitations`, `orders`, and `payments`, and enables RLS for each. Current constraints are intentionally recorded rather than overwritten by the proposed target contract:

| Record | Current status values | Notes |
| --- | --- | --- |
| Interest request | legacy `status`: `new`, `contacted`, `payment_link_sent`, `converted`, `cancelled`; `reservation_status`: `new`, `contacted`, `order_invited`, `converted`, `cancelled` | Two similar fields require an explicit compatibility/backfill plan in A1. |
| Newsletter | `active`, `unsubscribed` | Not an Admin v1 order-state authority. |
| Invitation | `draft`, `sent`, `opened`, `order_started`, `payment_open`, `paid`, `expired`, `cancelled` | Public token route records opening. |
| Custom order | `draft`, `awaiting_payment`, `payment_open`, `paid`, `payment_failed`, `payment_expired`, `cancelled`, `shipped` | Fulfilment is not yet a separate status model. |
| Payment | `created`, `open`, `paid`, `failed`, `expired`, `canceled`, `unknown` | Provider/webhook remains authoritative; `refunded` is not yet stored. |

## Product, shipping, payment, mail and current administration

The server configuration in `api/_drops.js` provides the only payable product/shipping authority: Eurofighter Typhoon protected A2 is EUR 17.75, NL is EUR 5.95, supported EU is EUR 9.50, and other destinations take a manual-review path. `src/data/drops.ts` contains separate display configuration, so the duplication described in ADR-003 is real. `api/_commerce.js` calculates quotes server-side, and `api/create-payment.js` snapshots quote/address values to custom orders before creating a Mollie checkout.

`api/_mollie.js` encapsulates Mollie calls and status mapping. `api/mollie/webhook.js` reconciles provider state, while `api/_notifications.js` contains the reservation confirmation, order invitation, paid-order confirmation, and internal paid notification templates. No shipping-confirmation sender exists yet. The only current admin-adjacent endpoint is `api/admin/send-order-invitation.js`: it uses a header secret, has an atomic sent-status claim, and is not a dashboard login. The checkout UI prevents a paid invitation from offering a further payment CTA; these safeguards were introduced by commit `a29a5e0` and are present in this baseline.

`docs/cloud-readiness.md` is present. No production records, secrets, or external resources were inspected in producing this inventory.
