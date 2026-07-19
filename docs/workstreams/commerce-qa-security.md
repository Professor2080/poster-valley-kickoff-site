# Worker brief: Commerce QA, Security and Integration Review

**Goal:** independently review contracts and candidate changes for custom-commerce security, correctness and cross-track boundaries. **Branch / draft PR:** `codex/commerce-qa-security-review` / `Review: Commerce security and integration gates`.

**Prerequisites/dependencies:** frozen ADRs/contracts; may run parallel to A1/A2 as a review-only task. **Own:** `docs/reviews/**` (create), test plans and non-invasive test additions agreed with owners. **Do not modify:** production config/data, migrations, payment/email implementation, Woo provisioning, public UX except explicit test fixtures.

**Scope/deliverables:** threat model (auth/RLS/PII/token/email/webhook/idempotency), status/transition matrix review, migration and rollback review, shipping price-authority tests, Woo boundary/outage checklist, test matrix and findings ranked with owners.

**Allowed:** local safe tests, code/docs inspection, draft review PR. **Forbidden:** production access, secret inspection, email/payment, deployment, merge, remediation outside agreed test scope. **Tests:** standard npm checks where code changes, diff/conflict scan and documented negative test cases. **Done:** actionable findings, evidence, release gates and handoff to coordinator; no unapproved implementation.
