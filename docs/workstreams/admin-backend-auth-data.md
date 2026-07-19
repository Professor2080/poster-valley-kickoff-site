# Worker brief: Admin Backend, Auth and Data Foundation

**Goal:** deliver A1’s secure custom-admin foundation, contracts and migration proposal/implementation only after approvals. **Branch / draft PR:** `codex/admin-backend-auth-data` / `A1: Admin auth, roles and data contracts`.

**Prerequisites/dependencies:** ADR-001/002/003/005 approved; product/status contract frozen. **Own:** `api/admin/**`, narrowly shared server helpers, `supabase/**`, backend tests and A1 docs. **Do not modify:** `src/**` except generated shared contract expressly agreed, public payment/Mollie flow, production configuration, Woo workstream docs.

**Scope/deliverables:** role allowlist/RLS/server verification design; additive, rollback-aware migrations; product registry, audit/event contract and API specs; paginated read endpoints; unauthorized/idempotency/status tests; migration/backfill/rollback and handoff notes. Preserve historical compatibility and Mollie webhook payment authority.

**Allowed:** inspect code, implement scoped code/migrations/tests/docs, local checks, branch/draft PR. **Forbidden:** deploy, run production migration/query, expose secrets, email customers, create payment, modify Woo, merge. **Tests:** `npm ci`, `npm run lint`, `npm test`, `npm run build`, `git diff --check`, conflict-marker scan plus focused authorization/RLS-safe tests. **Done:** reviewable A1 PR, no production action, contract version/handoff provided to frontend/QA. 
