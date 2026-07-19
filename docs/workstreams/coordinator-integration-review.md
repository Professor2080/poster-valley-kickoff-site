# Codex Cloud task: Coordinator Integration and Release Review

Repository: `Professor2080/poster-valley-kickoff-site`; base `main`; branch `codex/commerce-integration-review`; draft PR **Review: Commerce integration and release readiness**. Goal: assess candidate A1–A4 and Woo-spike work against accepted ADRs and recommend an order; do not merge or release.

Context/decisions: the live custom flow remains separate from Woo; magic-link Admin v1 uses Pascal as manager; custom preorder/server shipping/SKU `eurofighter-typhoon-a2` are fixed; staging is mandatory before production. Prerequisites: candidate PRs, QA review and staging migration/RLS evidence. Own `docs/reviews/**`, integration checklist and release recommendation. Do not modify application implementation, schema, payment/email operations, environments, production settings, Woo environments or worker contracts.

Inspect contract drift and merge conflicts; confirm staging-only data policy, Auth/RLS, migration forward/rollback/backfill/compatibility, audit/idempotency/PII, paid-only reporting, manual-quote approvals/expiry, internal fulfilment states, no Woo duplication and rollback/runbook evidence. Allowed: branch/PR inspection, local safe checks and documentation-only draft PR. Forbidden: production access/secrets, schema execution, email/payment, deploy/provision/merge.

Run npm checks on integration base where available plus diff/conflict scan. Final report: exact reviewed commits, tests/evidence, blockers/owners, ordered merge/release gates and explicit no-production confirmation. Done: clear approve/block recommendation; production migration/release remains a separate Pascal-approved action.
