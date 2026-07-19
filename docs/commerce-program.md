# Poster Valley commerce program

## Recommendation and approval boundary

Adopt a hybrid model: this repository remains the custom **Drop Operations** application for interest, personal invitations, invitation-originated Mollie payments and their fulfilment. A later, separately operated WooCommerce shop owns printed, in-stock products. The first Woo release should be a non-headless managed WordPress/WooCommerce store at `shop.postervalley.nl`, linked from the existing public site.

This package is a planning freeze, not an implementation approval. It records the repository as inspected on branch `main` at `a7c422a02eda3fc097eb489913555cc3ae9aee27` (the available checkout was at that merge commit; this Cloud clone has no local `main` ref or Git remote). It makes no application, schema, environment, payment, email, production-data, hosting, WordPress or deployment change.

## Current evidence

The Vite + React 19 + TypeScript public app has routes `/`, `/designs/eurofighter-typhoon`, `/order/:token`, `/privacy`, and `/terms`. Vercel functions provide `/api/interest`, `/api/newsletter`, `/api/order-invitation`, `/api/order-quote`, `/api/create-payment`, `/api/mollie/webhook`, and `/api/admin/send-order-invitation`. Supabase schema is a single `supabase/schema.sql`; it defines `drop_interest_requests`, `newsletter_signups`, `order_invitations`, `orders`, and `payments`, all with RLS enabled. The only current admin mechanism is the header-secret-protected single-invitation sender, not dashboard authentication.

The server configuration in `api/_drops.js` has Eurofighter Typhoon / A2 at EUR 17.75, NL EUR 5.95, supported EU EUR 9.50, and manual review outside those rates. A separate browser presentation copy exists in `src/data/drops.ts`; server quoting in `api/_commerce.js` is authoritative. Resend templates cover reservation, invitation and paid-order confirmation; Mollie is created from `api/create-payment.js` and webhook status is mapped in `api/mollie/webhook.js`. Commit `a29a5e0` on the inspected history contains the secure single-invitation sender and payment CTA state fix. `docs/cloud-readiness.md` is present. The repository has one Node test, `test/send-order-invitation.test.js`.

## Program sequence

1. **Human approval/freeze:** approve ADRs, product-code convention, admin allowlist owner, and the shipping policy model.
2. **A1:** Admin Backend, Auth and Data Foundation. This is the schema/API contract gate.
3. **A2:** Admin shell and read-only UX may start against frozen mocks after A1 contract review, then integrates after A1 merges.
4. **A3:** controlled invitation, shipping-review, fulfilment and email-history operations after A1/A2.
5. **A4:** reporting, CSV exports and polish after operational events are reliable.
6. **Woo spike:** independently assess managed hosting and staging; no external provisioning until Pascal approves the spike result.
7. **Integration/release review:** validates ownership, migrations, security, operational runbooks and release gates; it does not merge or deploy.

## Worker tasks and execution model

Use separate, human-started Codex Cloud tasks with one branch and draft PR per workstream. This coordinator task can document and request work, but should not claim durable autonomous supervision of independently scheduled Cloud tasks. Isolated branches/PRs are the meaningful isolation boundary; shared local worktrees are useful only for a local developer and are not required for Cloud coordination.

| Brief | Branch | Start condition |
| --- | --- | --- |
| [Admin Backend, Auth and Data Foundation](workstreams/admin-backend-auth-data.md) | `codex/admin-backend-auth-data` | ADR approval |
| [Admin Frontend and Operations UX](workstreams/admin-frontend-operations.md) | `codex/admin-frontend-operations` | frozen contracts/mocks |
| [WooCommerce Architecture and Staging Spike](workstreams/woocommerce-spike.md) | `codex/woocommerce-architecture-spike` | ADR-004 approval; research only |
| [Commerce QA, Security and Integration Review](workstreams/commerce-qa-security.md) | `codex/commerce-qa-security-review` | frozen contracts |
| [Coordinator Integration and Release Review](workstreams/coordinator-integration-review.md) | `codex/commerce-integration-review` | candidate PRs available |

## Approval gates and Pascal actions

Before implementation Pascal must approve: (1) who is on the initial Supabase Auth admin allowlist and whether magic links are acceptable; (2) `product_code` / SKU format and Eurofighter’s proposed `eurofighter-typhoon-a2`; (3) that custom preorder remains the only preorder channel until explicitly changed; (4) the retention/audit policy with legal advice where needed; (5) shipping-rate authority, quote expiry and who may approve manual quotes; (6) which fulfilment email transitions are customer-facing; and (7) the Woo host, staging domain, legal/tax/returns, carrier and customs decisions after the spike. Hosting purchase, staging creation, plugins, Woo test payments and production launch remain manual approval gates.

**Start first:** `Admin Backend, Auth and Data Foundation`, only after the listed ADR decisions are explicitly approved. It establishes authorization, audit and status contracts that every operational UI depends on.

Read the architecture documents, ADRs, workstream briefs, and [dependency gates](architecture/dependency-and-release-gates.md) together.
