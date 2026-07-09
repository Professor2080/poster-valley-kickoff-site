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

## Waitlist

The site has two separate collection flows:

- `drop_interest_requests` for poster-specific interest requests from a poster detail page.
- `newsletter_signups` for the general update form at the bottom of the homepage.

Both forms submit to Vercel API functions first. The browser never receives the Supabase
service-role key.

## Supabase Setup

Create the tables by running:

```text
supabase/schema.sql
```

The tables have Row Level Security enabled. No public select policy is added; submissions should go
through the Vercel API endpoints.

Required environment variables:

```text
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
RESEND_API_KEY=
FORM_NOTIFICATION_TO=studio@postervalley.nl
FORM_NOTIFICATION_FROM="Poster Valley <onboarding@resend.dev>"
FORM_NOTIFICATION_REPLY_TO=studio@postervalley.nl
SITE_URL=https://www.postervalley.nl
```

Set these in Vercel as server-side project environment variables for Production, Preview and
Development as needed. Keep local values in `.env.local`; do not commit secrets.

`RESEND_API_KEY` enables internal form-copy emails. Until `postervalley.nl` is verified in Resend,
use a verified Resend sender such as `onboarding@resend.dev` for `FORM_NOTIFICATION_FROM`. After
domain verification, set the sender to a branded address such as
`Poster Valley <studio@postervalley.nl>` or `Poster Valley <notifications@postervalley.nl>`.

## Deployment

Vercel is the intended deployment target for this standalone site. Use:

- Build command: `npm run build`
- Output directory: `dist`

Connect the GitHub repository to Vercel for automatic deploys from `main`.

After setting environment variables, verify:

```bash
npm run lint
npm run build
```

Then submit one poster-specific request and one general update signup from the deployed preview.
