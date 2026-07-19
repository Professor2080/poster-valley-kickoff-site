# Worker brief: Admin Frontend and Operations UX

**Goal:** create A2 shell/read-only custom operations UX against frozen contracts/mocks, then integrate only after A1. **Branch / draft PR:** `codex/admin-frontend-operations` / `A2: Admin shell and read-only operations UX`.

**Prerequisites/dependencies:** approved ADRs and A1 API/status contract; mock work may begin after freeze, real APIs after A1 merges. **Own:** `src/admin/**` (create), admin-only styles/components/tests, frontend handoff docs. **Do not modify:** `api/**`, `supabase/**`, existing public routes/components, Mollie/Resend, Woo docs.

**Scope/deliverables:** login/session states, navigation, period dashboard, accessible paginated/filterable read-only reservation/order/invitation/payment lists/detail/timeline, safe PII states, loading/error/empty states and contract mocks. No customer-affecting write action in A2.

**Allowed:** scoped UI/code/tests/docs/draft PR. **Forbidden:** schema/API changes, production deployment, secret access, email/payment, Woo/WordPress install, merge. **Tests:** standard npm checks, diff/conflict scan and component/manual accessibility evidence. **Done:** responsive read-only UI follows frozen contracts, no duplicated business logic, clear integration/handoff notes.
