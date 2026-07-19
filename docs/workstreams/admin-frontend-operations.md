# Codex Cloud task: Admin Frontend and Operations UX (A2)

## Task identity

Repository: `Professor2080/poster-valley-kickoff-site`. Base branch: `main` (or merged A1 when integration begins). Create `codex/admin-frontend-operations`; draft PR **A2: Admin shell and read-only operations UX**. Goal: build the secure admin shell and read-only operational views, not action controls.

## Context and prerequisites

Current app is React/Vite with custom Supabase interest/invitation/order/payment records; there is no dashboard. Follow accepted ADR-001..006: magic-link/role access, Pascal manager, custom/Woo separation, custom preorder, server shipping authority, Woo subdomain, product SKU, and staging-only development. A1 starts first. This task may create frozen mock UI after A1 contracts are reviewed; real API/session integration waits until A1 merges and staging credentials are available.

## Ownership and implementation

Own `src/admin/**` (create), admin-only styles/components/tests and A2 docs. Do not modify `api/**`, `supabase/**`, current public components/routes, Mollie/Resend logic, production configuration, Woo files or worker briefs. Implement accessible login/session/error states, navigation, period dashboard, paginated/filterable read-only lists/details/timelines for reservations, invitations, orders and payments, and safe PII/loading/empty states. Use A1 contracts; do not recreate server pricing/status logic, add write actions, alter contracts, or send mail.

## Restrictions, tests and handoff

Allowed: scoped UI, mocks, tests, staging-safe read integration after A1 merge, draft PR. Forbidden: production access/deploy/merge, secrets, schema/API changes, emails/payments, Woo provisioning, operational action controls. Keep staging data non-production and identifiable. Run standard npm checks, diff/conflict scan, component tests where available and documented keyboard/accessibility review. Final report: files, contract version, mock-vs-real integration status, tests, screenshots if UI visibly changes, blockers and no-production-action confirmation. Done: responsive read-only UI, contract adherence, no duplicated business rules and clear A3 handoff.
