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

## Checks

```bash
npm run lint
npm run build
```

## First Drop Assets

The first poster PDF is stored here:

```text
public/posters/first-drop.pdf
```

The web preview used by the site is:

```text
public/posters/first-drop-preview.webp
```

The preview was rendered from page 1 of the PDF at the original portrait aspect ratio. Do not edit
the artwork inside the preview; regenerate it from the PDF if the source file changes.

## Waitlist

The waitlist form is currently a frontend placeholder. It opens a prepared email to
`studio@postervalley.com` and does not store data.

Before public launch, connect the form to the agreed storage path, preferably:

```text
Vercel API route -> Supabase reservations table
```

Do not expose a Supabase service-role key in browser code.

## Deployment

Vercel is the intended deployment target for this standalone site. Use:

- Build command: `npm run build`
- Output directory: `dist`

Connect the GitHub repository to Vercel for automatic deploys from `main`.
