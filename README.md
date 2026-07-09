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
