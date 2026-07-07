# Poster Valley Kickoff Site

Temporary standalone launch site for the first Poster Valley print reservations.

This project is intentionally separate from the main Poster Valley MVP repository. It is a fast,
promotional React/Vite/Tailwind site for collecting early reservation interest before the full
Next.js, WordPress/WooCommerce and Open Edition platform is ready.

## Stack

- React
- Vite
- TypeScript
- Tailwind CSS
- lucide-react icons

## Local Development

```bash
npm install
npm run dev
```

## Checks

```bash
npm run lint
npm run build
```

## Reservation Form

The form is prepared for Netlify Forms:

- `index.html` contains a hidden `reservation` form so Netlify can detect the fields at deploy time.
- `src/App.tsx` submits URL-encoded form data to `/`.
- On Netlify, submissions should appear under the site's Forms dashboard.

If the site is deployed elsewhere, connect the form to a real endpoint before publishing. Do not
collect real customer data until the destination, privacy text and retention process are approved.

## Content Notes

- Public wording uses `Reserve`, `First Print` and `First Edition` language, not `back`.
- The page does not implement checkout, Mollie payments, refunds or Open Edition business logic.
- The progress meters are static launch copy and must be replaced with real values before public use.

## Recommended Deploy

Netlify is the simplest first deploy target because the reservation form can work without custom
backend code. Vercel is fine for the frontend, but needs a separate form endpoint or serverless
function for storing reservation requests.
