# AGENTS.md

## Scope and precedence

These instructions apply to the entire `poster-valley-kickoff-site` repository.

Follow instructions in this order:

1. The user's current request.
2. This `AGENTS.md`.
3. Accepted ADRs and repository documentation.
4. Existing implementation and tests.

If documentation and implementation disagree, do not silently choose one. Inspect the relevant history and contracts, state the discrepancy, and use the safest interpretation. Never change an accepted business rule merely to make a test pass.

## Project purpose

This repository contains the standalone Poster Valley kickoff site for the first poster drop. It is intentionally separate from the main Poster Valley MVP repository.

The current product combines:

- a public React/Vite/Tailwind site;
- lightweight poster-interest reservations;
- newsletter signup;
- personal order invitations;
- server-calculated shipping and Mollie Checkout;
- a protected Admin interface;
- Supabase persistence and authorization;
- Vercel serverless API functions;
- Resend email delivery.

Do not turn this repository into the wider Poster Valley platform unless the user explicitly changes that scope.

## Product rules

Preserve these accepted rules unless the user explicitly decides otherwise:

- Use the term **designs**, not artworks, in customer-facing product language.
- A reservation expresses interest; it is not a purchase.
- Do not collect shipping addresses during reservation.
- A customer supplies shipping details only when accepting a personal order invitation.
- Product price, shipping amount, manual-review status, and order total are server-authoritative.
- Never create fake scarcity or misleading urgency.
- Interest and preorder flows remain part of the custom drop flow.
- In-stock commerce belongs to WooCommerce when that workstream is introduced.
- Only provider-confirmed payment may release fulfilment. Never add a manual “mark paid” shortcut.
- Outside-EU or otherwise unsupported destinations must follow the accepted manual-review/blocking rules.
- Real operational email remains disabled or suppressed until explicitly approved for activation.

Read the relevant ADRs and planning documents before changing lifecycle, commerce authority, Admin roles, fulfilment, payment, shipping, or email behavior.

## Architecture and trust boundaries

Treat the browser as untrusted.

- Keep the Supabase service-role key, Mollie keys, Resend keys, admin secrets, and raw invitation tokens server-side.
- Never expose privileged values through `VITE_*`, client bundles, public errors, URLs, logs, fixtures, screenshots, or committed files.
- Public clients must not choose prices, totals, trusted record origin, payment state, fulfilment state, or privileged roles.
- Use narrowly scoped server-authorized endpoints for Admin data and operations.
- UI hiding is not authorization. Enforce permissions on the server and in the database.
- Preserve RLS, least privilege, immutable history, idempotency, and explicit confirmation for mutations.
- Keep `SECURITY DEFINER` functions on a restricted `search_path`; schema-qualify extension functions rather than broadening the search path.
- Revoke privileged RPC execution from `PUBLIC`, `anon`, and `authenticated` unless an accepted design explicitly requires otherwise.
- Store only hashes of personal order tokens. Never persist or log raw tokens.

## Personal data

Apply data minimisation while keeping the Admin usable.

- Reservation data may include customer name and email.
- Full shipping address belongs to an order, not a reservation.
- Lists should expose only the fields needed for identification and operations.
- Return full personal data only in an explicitly requested, authorized detail view.
- Do not put full addresses or unnecessary personal data in generic events, audit payloads, logs, URL parameters, or error messages.
- Audit that sensitive data changed, not the sensitive value itself.
- Preserve pagination and narrow projections for Admin list endpoints.
- Do not repeat real customer data in reports or chat unless strictly necessary; redact it by default.

## Test data and record origin

Never assume that a Production record is test data based only on an email provider, name, or appearance.

Where `record_origin` exists, use only the accepted constrained values and authorization rules. Public submissions must default to the customer origin and must not be able to select a trusted origin. Automated fixtures must be explicitly marked as test data; internal trials must be explicitly marked as internal pilots.

- Use synthetic addresses such as reserved `.test` domains for fixtures.
- Make test records visually and structurally distinguishable.
- Keep test/internal records out of customer reporting when the relevant filter exists.
- Do not delete or reclassify ambiguous records without explicit authorization and an audit trail.
- Clean up remote fixtures only when the test plan and user authorization permit it.

## Database and migrations

Use additive, reviewable Supabase migrations.

- Never edit migration history that has already been applied to any remote environment.
- Create migrations through the repository's established Supabase CLI workflow.
- Inspect dependencies and remote migration history before applying anything.
- Add indexes for new foreign keys and query paths when justified.
- Add SQL-contract regression tests for permissions, RLS, function configuration, indexes, constraints, and critical invariants.
- Keep migrations deterministic and safe to apply in the intended order.
- Do not run broad resets, destructive cleanup, or schema rewrites against a remote project.
- Never apply a migration to Staging or Production merely because it exists in a branch.

## External systems and environments

Treat Local, Preview/Staging, and Production as separate environments. Verify the exact target project and deployment before any remote action.

### Production

Production changes require explicit user authorization for the specific action. A request to implement code does not authorize any of the following:

- applying a Production migration;
- changing Production Auth or roles;
- modifying or deleting customer records;
- sending real email;
- creating a real Mollie payment or refund;
- changing Vercel Production environment variables;
- deploying manually;
- merging a pull request.

Before an authorized Production operation:

1. verify the exact project, environment, branch/commit, and migration state;
2. describe the bounded action and safety limits;
3. avoid real customer records whenever possible;
4. use rollback-only synthetic fixtures for smoke tests when feasible;
5. verify cleanup, privileges, advisors, and resulting state afterward.

Stop immediately on an unexpected dependency, target mismatch, schema difference, or possible customer impact.

### Staging and Preview

Do not assume Staging access is authorized by a code-change request. Ask for separate authorization before remote migrations or stateful tests. Keep email suppressed and do not create real payments. Prefer transaction-wrapped synthetic fixtures with verified rollback.

### Vercel, Supabase, Mollie, and Resend

- Production deploys from `main` through the connected Vercel project.
- Browser-safe Supabase URL/publishable-key variables are distinct from server secrets.
- A Mollie live key may exist in Production; calling a payment-creation endpoint can create a real payment.
- Do not send email merely to verify a handler. Use the configured suppression/mock delivery path.
- Never print secret values in output.

## Implementation guidance

Before editing:

1. inspect the repository status and current branch;
2. read this file, the README, relevant ADRs/plans, migrations, API handlers, and tests;
3. trace the real end-to-end path instead of inferring behavior from UI text;
4. identify which environment, if any, is in scope;
5. note unrelated user changes and leave them untouched.

When changing code:

- Prefer small, coherent changes over opportunistic refactors.
- Reuse existing validation, response, authorization, idempotency, and audit patterns.
- Preserve accessibility: keyboard operation, focus management, labels, status feedback, and responsive behavior.
- Avoid dependencies unless they provide clear value and fit the current stack.
- Update documentation when behavior, setup, environment variables, or operational limitations change.
- Never weaken a security boundary to simplify frontend work or testing.
- Do not use subagents unless the user explicitly requests delegation/parallel review or an applicable workflow instruction requires it.

## Verification

Run checks proportional to the change. For normal implementation work, the baseline is:

```bash
npm ci
npm run lint
npm test
npm run build
git diff --check
```

Also:

- scan for conflict markers;
- inspect the final diff;
- scan for secrets and unexpected browser-write surfaces;
- scan changed code for personal data in logs, URLs, events, and errors;
- add focused regression tests for every corrected bug or security invariant;
- perform local browser verification for changed UI flows, including keyboard and mobile behavior when relevant.

Do not claim a remote deployment, migration, email, payment, or browser flow was verified unless it was actually checked in that environment. Report existing warnings separately from regressions introduced by the change.

## Git and pull requests

Unless the user explicitly asks for a direct, low-risk documentation change:

- start from an up-to-date `main`;
- create a focused branch;
- keep commits intentional and scoped;
- push the branch and open a Draft pull request;
- do not merge without explicit approval.

Before merge or publication, verify the current remote head SHA, target branch, mergeability, checks, and the exact diff. Do not force-push, rewrite shared history, delete branches, or bypass required checks unless explicitly authorized.

A PR description must accurately state:

- business behavior changed;
- schema/migration files;
- authorization and privacy boundaries;
- tests and verification performed;
- remote actions not performed;
- known limitations and remaining gates.

## Communication

Communicate with Pascal in clear Dutch unless he asks for another language. Lead with the outcome, distinguish facts from assumptions, and explain blockers without unnecessary jargon.

For final handoff, report:

- what changed;
- files and migrations involved;
- verification results and test count;
- branch, commit SHA, and PR link when applicable;
- anything intentionally not deployed, applied, sent, paid, or merged;
- the safest next action.

Never describe planned work as completed.
