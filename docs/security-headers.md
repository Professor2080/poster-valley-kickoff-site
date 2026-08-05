# HTTP security headers

## Scope and baseline

This policy is defined centrally in `vercel.json`. The Production baseline at
`805e065b2c48277ee05e47eb6c1db743c369e5e3` already receives
`Strict-Transport-Security: max-age=63072000` from Vercel on public pages, static assets and
Admin APIs. The repository does not duplicate that platform-owned header.

Before this policy, direct Production responses did not include a CSP, `X-Content-Type-Options`,
`Referrer-Policy`, `Permissions-Policy` or `X-Frame-Options`. Protected Admin API responses already
returned `401`, JSON, `Cache-Control: private, no-store, max-age=0`, `Pragma: no-cache` and
`Vary: Authorization`; those route-owned headers remain unchanged.

## Policy

All routes receive:

- `X-Content-Type-Options: nosniff`;
- `Referrer-Policy: strict-origin-when-cross-origin`.

Document routes also receive:

- `Content-Security-Policy: default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors
  'none'; form-action 'self'; script-src 'self' https://vercel.live; script-src-attr 'none';
  style-src 'self' https://fonts.googleapis.com https://vercel.live 'unsafe-inline'; style-src-attr
  'unsafe-inline'; font-src 'self' https://fonts.gstatic.com https://vercel.live
  https://assets.vercel.com; img-src 'self' data: blob: https://vercel.live https://vercel.com;
  connect-src 'self' https://epqpeoubkbftcvxjbqeo.supabase.co
  https://stbunwkgvxfwmbjivgos.supabase.co https://vercel.live wss://ws-us3.pusher.com; frame-src
  https://vercel.live; upgrade-insecure-requests`;
- `Permissions-Policy: camera=(), geolocation=(), microphone=()`;
- `X-Frame-Options: DENY` as legacy defense alongside CSP `frame-ancestors 'none'`.

The document-only rule excludes `/api/`, `/assets/` and `/posters/`. Static scripts, styles and
images still receive `nosniff`, but not document-only policies. No rule sets `Cache-Control`,
`Content-Type`, `Pragma` or `Vary`.

## Compatibility decisions

- The Vite Production build contains no inline scripts and needs neither `unsafe-inline` nor
  `unsafe-eval` in `script-src`. The only external script origin is Vercel's documented Preview
  Toolbar origin.
- The existing React UI needs `style-src-attr 'unsafe-inline'` for CSS custom properties used for
  poster rotation and animation delays. Vercel's Preview Toolbar additionally requires inline
  styles under `style-src`; every external style origin remains explicit.
- `connect-src` contains the two exact browser Supabase origins documented for Production and
  Clean Staging Preview. It contains no wildcard. Same-origin API calls remain available.
- Mollie Checkout is reached through a top-level redirect and returns to the same-origin order
  route. It does not require a CSP script, frame, form or connection exception.
- Vercel Preview enables its review toolbar by default. Its exact documented script, style, image,
  font, frame and WebSocket origins are allowed so the Preview remains reviewable without a CSP
  violation; no `*.vercel.*` wildcard is used.
- COOP, COEP and CORP are omitted because the application does not require cross-origin isolation
  and those headers would add compatibility risk without a demonstrated boundary benefit.
- `X-XSS-Protection` is omitted because modern browsers rely on CSP and the legacy header is
  obsolete. HSTS remains Vercel-owned to avoid duplicate configuration.

Rollback is a normal revert of the header configuration. It requires no database, environment,
provider or deployment-setting change.
