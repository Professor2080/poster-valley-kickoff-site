# Poster Valley Kickoff Site

Temporary standalone launch site for Poster Valley's first poster drop.

This project is intentionally separate from the main Poster Valley MVP repository. It is a focused
React/Vite/Tailwind site for presenting the first poster design before the full commerce platform is
ready.

## Stack

- React
- Vite
- TypeScript
- Tailwind CSS
- lucide-react for the small amount of icon UI

## Local Development

```bash
npm ci
npm run dev
```

`npm run dev` is enough for visual frontend work. Local development is database-free by default.
Remote API/provider validation is a separate, explicitly approved task and may target only Clean
Staging after that environment has been created and verified.

## Checks

On Windows/PowerShell:

```powershell
npm run preflight -- <explicit worktree-contract arguments>
npm run verify -- <the same active-worktree contract arguments>
```

The verification command performs a clean install, lint, the complete test suite, a production
build, Git whitespace checks, conflict-marker and trailing-whitespace scans, a tracked-secret and
browser-prefix scan, the environment-key policy check, and the Vercel function-budget test. It does
not contact a database or external provider.

The required GitHub `quality-gate` additionally starts a fresh PostgreSQL 17 service and runs
`npm run test:schema-baseline`. That loopback-only proof applies the canonical baseline twice from
`template0`, verifies the permanent SQL contracts and exact fingerprints, exercises the concurrent
payment claim/replay path, and removes both temporary databases. The command refuses to run without
the explicit `POSTER_VALLEY_LOCAL_PG=1` opt-in and a `127.0.0.1` target.

The required contract arguments and worktree roles are documented in the
[worktree and branch policy](docs/worktree-and-branch-policy.md).

## Development foundation

- [Development workflow](docs/development-workflow.md)
- [Environment matrix](docs/environment-matrix.md)
- [Database release process](docs/database-release-process.md)
- [Clean Staging runbook](docs/clean-staging-runbook.md)
- [Worktree and branch policy](docs/worktree-and-branch-policy.md)
- [Release runbook and external-settings plan](docs/release-runbook.md)
- [Skill governance and register](docs/skills/README.md)

Changes follow one of three routes: fast for low-risk repository work, controlled for data,
authorization, payments, operational email and other trust-boundary changes, and infrastructure for
environment or platform work. Committed migrations on `main` are the sole database-history source.
The existing Supabase project `cdmocdodehjmcgtxicaj` is inactive and frozen as Legacy Staging; it
is not a valid migration baseline. Clean Staging `stbunwkgvxfwmbjivgos` exists in `eu-west-1` and is
recorded as `ACTIVE_HEALTHY`. Its remote migration history contains
`20260731113000_schema_baseline_v1` followed by
`20260731193947_harden_default_privileges`; the resulting schema has 13 tables, 4 views, 2 enums,
27 routines, 9 triggers and 2 policies. Version-controlled Clean Staging fixture tooling exists but
has not been executed remotely. PR #20 remains Draft and unmerged, Production is unchanged and
Legacy Staging remains inactive. The next gate is to seed and verify Clean Staging, then let Pascal
review the frontend and Admin flows.

## First Drop Assets

The web preview used by the site is:

```text
public/posters/first-drop-preview.webp
```

Do not place print-ready PDFs or other high-resolution source files in `public/`. Public assets are
served directly by the website and can be downloaded if someone knows the URL.

## Reservations and Updates

The site has two separate collection flows:

- `drop_interest_requests` for poster-specific reservations from a poster detail page.
- `newsletter_signups` for the general update form at the bottom of the homepage.

Both forms submit to Vercel API functions first. The browser never receives the Supabase
service-role key.

Poster reservations are intentionally lightweight. A visitor reserves interest in a specific poster
without payment, without checkout and without address details. The API derives poster title, price,
format and shipping profile on the server from `dropSlug`; the browser only sends customer fields
and consent values. If a drop goes into production, Poster Valley can later send a personal order
invitation with final price, shipping and payment details.

## Personal Order Invitations

The second phase is a personal order invitation. It is not a public shop or cart. A visitor opens a
personal `/order/<token>` link, confirms shipping details, sees a server-calculated shipping quote
and total, and is sent to Mollie Checkout for payment.

The token itself is never stored in Supabase. The database stores only a SHA-256 `token_hash`. This
is practical for the current stack because order links use high-entropy random tokens and the server
can hash the incoming token before lookup.

Current shipping rates are configured in code and must be reviewed before production use:

- The Netherlands: EUR 5.95
- European Union pilot: EUR 9.50
- Outside the EU: manual review/contact first, no automatic payment
- Unsupported/special territories: manual review or blocked from automatic payment

The serverless API recalculates prices and shipping on every quote/payment request. The client never
decides product price, shipping amount, manual-review status or total price.

The previous rest-of-world automatic shipping amount is retained only as disabled review metadata in
`api/_drops.js`. It should not be used for payment until shipping policy is reviewed.

## Terms and Privacy

The temporary order terms are available at:

```text
/terms
```

The payment checkbox links to `/terms` and `/privacy`. The terms page includes the current seller
details for Het Projectmakersbureau, including Chamber of Commerce and VAT number. Before broader
production sales, final VAT wording, cancellation wording and operational retention rules still need
business and legal review.

## Supabase Setup

`supabase/migrations/` contains the canonical baseline followed by additive default-privilege,
shipping-confirmation, Order Flow Board and production-threshold-default migrations. New drops use
`production_threshold = 5` unless an authorized creation flow explicitly supplies another non-null
value; Eurofighter A2 is explicitly configured as `5`, while other existing configured thresholds
are not rewritten. The column remains nullable for historical compatibility. The six files used to construct the baseline are preserved byte-for-byte under
`supabase/migrations-archive/pre-baseline-v1/`, with immutable hashes in `manifest.json`; archived
files are historical provenance and must never be executed by the Supabase CLI. `supabase/schema.sql`
is retained as historical source material, not as active migration history. Committed migration
files on `main` are the only authoritative migration history; an applied migration is never edited
in place. Do not execute schema or migration files during ordinary local development. Local
PostgreSQL proof, Clean Staging validation and every remote migration are separate work blocks with
explicit target verification and human approval. See the
[database release process](docs/database-release-process.md),
[environment matrix](docs/environment-matrix.md) and
[release runbook](docs/release-runbook.md).

The tables have Row Level Security enabled. No public select policy is added; submissions should go
through the Vercel API endpoints.

Required server-side environment variables:

```text
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
RESEND_API_KEY=
VERSEL_RESEND_API_KEY=
FORM_NOTIFICATION_TO=
FORM_NOTIFICATION_FROM=
FORM_NOTIFICATION_REPLY_TO=
SITE_URL=
ADMIN_ACTION_SECRET=
POSTER_VALLEY_ENV=
OPERATIONAL_EMAIL_DELIVERY_ENABLED=
OPERATIONAL_EMAIL_FROM=
OPERATIONAL_EMAIL_REPLY_TO=
ADMIN_INVITATION_TOKEN_SECRET=
ADMIN_CONFIRMATION_SECRET=
MOLLIE_API_KEY=
MOLLIE_TEST_MODE=
```

Set only the names allowed for each environment by the
[environment matrix](docs/environment-matrix.md). Staging/Preview use their own server-only
invitation and confirmation secrets for approved contract validation; operational email delivery
and live provider configuration remain Production-only. Keep local values in `.env.local`; do not
commit secrets. The Supabase
service-role key must remain server-side only and must never be exposed through browser-prefixed
environment variables.

`RESEND_API_KEY` enables internal form-copy emails and customer reservation confirmations.
`VERSEL_RESEND_API_KEY` is still supported as a backwards-compatible alias until the Vercel
environment has been normalized. `FORM_NOTIFICATION_FROM` must use a sender domain verified in
Resend, currently `auth.hetprojectmakersbureau.nl`. Keep actual recipient, sender and reply-to
values in Vercel environment variables rather than hard-coding secrets in the repository.

`MOLLIE_API_KEY` enables Mollie Checkout payment creation and webhook status lookup. Keep it
server-side only. Do not expose it as a `VITE_` variable. If it is missing, the order page still
loads, quote calculation still works, and the payment button returns a clear "Payment is not
configured yet" message.

`MOLLIE_TEST_MODE=true` is only needed for organization-level Mollie credentials that support an
explicit testmode parameter. For normal `test_...` or `live_...` API keys, Mollie already derives
mode from the key and this variable can stay empty.

Production uses a Mollie live key. Calling the payment endpoint there can create a real payment and
must only happen for a confirmed customer order.

## Admin operational email delivery

The authenticated `/admin` workspace opens on the guided Order Flow Board. It maps the existing
reservation, invitation, payment and fulfilment truth into six read-only-derived phases; only its
explicit Process, Send, Ship, delivery-confirmation and Close controls can advance work. See the
[Order Flow Board architecture](docs/architecture/order-flow-board.md) for the mapping, authority
boundaries, backfill and rollout rules.

The workspace also provides contextual, manager-only invitation preview, send,
retry and deliberate resend actions. A manager can also move a provider-confirmed paid order from
`packed` to `shipped` with validated carrier/tracking details and retry a failed or suppressed
shipping confirmation without repeating the fulfilment transition. Every mutation requires a
second action-specific button click backed by a short-lived server proof bound to the actor,
normalized payload and reviewed record state. The retired `/api/admin/send-order-invitation`
endpoint remains a `410` tombstone.

Operational invitation and shipping-confirmation delivery is suppressed outside Production. See
[`docs/admin-a32-production-email-runbook.md`](docs/admin-a32-production-email-runbook.md) for the
exact fail-closed Production configuration and release validation. Never put invitation tokens,
customer addresses, Resend responses or server secrets in logs or browser-visible configuration.

## Mollie Webhook Testing

Mollie webhooks are received at:

```text
/api/mollie/webhook
```

Provider-backed webhook testing belongs to the controlled path and may use only an explicitly
approved Clean Staging/Preview setup; it must not use Production or Legacy Staging for feature
verification. The webhook is idempotent for customer/internal paid emails by checking sent
timestamp columns on the order before sending.

## Not Production-Ready Yet

- Shipping rates remain review-needed; outside-EU shipping is manual review only.
- Seller details are documented; definitive VAT wording still needs business/legal review.
- No batch email sending exists.
- Mollie live payments should only be enabled after testmode verification and explicit production
  approval.

## Deployment

Production runs at:

```text
https://www.postervalley.nl
```

Vercel is the deployment target for this standalone site. The Vercel project is connected to the
GitHub repository, and production should deploy from `main`.

Use:

- Build command: `npm run build`
- Output directory: `dist`

Do not perform a normal manual `--prod` deployment. Follow the
[release runbook](docs/release-runbook.md); deployment, real-email/payment smoke tests and remote
test-record handling each require explicit authorization.
