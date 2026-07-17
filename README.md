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
npm install
npm run dev
```

`npm run dev` is enough for visual frontend work. Use Vercel's local dev flow when testing the API
functions with real Supabase environment variables.

## Checks

```bash
npm run lint
npm run build
```

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

Create the tables by running:

```text
supabase/schema.sql
```

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
MOLLIE_API_KEY=
MOLLIE_TEST_MODE=
```

Set these in Vercel as server-side project environment variables for Production, Preview and
Development as needed. Keep local values in `.env.local`; do not commit secrets. The Supabase
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

## Manual Test Invitation

No admin UI exists yet. For a controlled test, create one invitation manually in Supabase SQL. Use a
fresh high-entropy token and do not reuse it.

```sql
-- Example token for local/preview testing only:
-- pv_test_replace_with_32_plus_random_chars

insert into public.order_invitations (
  interest_request_id,
  drop_id,
  drop_slug,
  drop_title,
  email,
  email_normalized,
  first_name,
  last_name,
  quantity,
  currency,
  unit_price,
  subtotal_amount,
  status,
  token_hash,
  expires_at,
  sent_at,
  metadata
)
select
  id,
  drop_id,
  drop_slug,
  drop_title,
  email,
  lower(email),
  first_name,
  last_name,
  quantity,
  'EUR',
  17.75,
  17.75 * quantity,
  'sent',
  encode(digest('pv_test_replace_with_32_plus_random_chars', 'sha256'), 'hex'),
  now() + interval '14 days',
  now(),
  jsonb_build_object('created_for', 'manual_test')
from public.drop_interest_requests
where drop_slug = 'eurofighter-typhoon'
order by created_at desc
limit 1;
```

Then open:

```text
https://<preview-or-production-domain>/order/pv_test_replace_with_32_plus_random_chars
```

Remove test records from `payments`, `orders`, and `order_invitations` after verification.

## Mollie Webhook Testing

Mollie webhooks are received at:

```text
/api/mollie/webhook
```

For local development, Mollie must be able to reach the webhook URL. Use a tunnel such as ngrok, or
test on a Vercel preview deployment. The webhook is idempotent for customer/internal paid emails by
checking sent timestamp columns on the order before sending.

## Not Production-Ready Yet

- Shipping rates remain review-needed; outside-EU shipping is manual review only.
- Seller details are documented; definitive VAT wording still needs business/legal review.
- No admin UI exists for creating invitations.
- No batch email sending exists.
- Mollie live payments should only be enabled after testmode verification and explicit production
  approval.
- PR #3 should remain draft until the release decision and production environment approval are
  explicit.

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

After setting environment variables, verify:

```bash
npm run lint
npm run build
```

Then smoke-test one poster-specific request and one general update signup on the deployed site, and
remove any test records from Supabase after verification.
