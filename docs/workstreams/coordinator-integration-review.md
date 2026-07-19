# Worker brief: Coordinator Integration and Release Review

**Goal:** integrate reviewed work logically and issue a release recommendation; do not merge/deploy. **Branch / draft PR:** `codex/commerce-integration-review` / `Review: Commerce integration and release readiness`.

**Prerequisites/dependencies:** A1–A4 candidate PRs and Woo spike/review outputs available. **Own:** `docs/reviews/**`, integration checklist and release recommendation. **Do not modify:** product implementation, schema, payment/email operations, production settings, Woo environments.

**Scope/deliverables:** compare PRs to ADRs, identify conflicts/contract drift, confirm RLS/migration/idempotency/audit/PII/rollback evidence, verify paid-only reporting and no Woo duplication, assemble merge order and manual release checklist with blockers.

**Allowed:** inspect branches/PR metadata and local safe checks, documentation-only draft PR. **Forbidden:** merge, deploy, provision, production access, secrets, email/payment, schema execution. **Tests:** re-run standard npm checks on proposed integration base where available plus diff/conflict scan. **Done:** explicit approve/block recommendation, unresolved owners, ordered merge gates and Pascal handoff.
