# Dependencies and release gates

```text
ADR freeze + separate staging Supabase / Preview non-production controls
  -> A1 auth + schema/API contracts (starts first)
       -> A2 real read integration -> A3 operational writes -> A4 reporting
  -> A2 frontend mock shell (parallel only after A1 contracts reviewed)
  -> QA/security review (parallel with A1)
  -> Woo research spike -> Pascal approval -> hosting/staging/install -> test-mode checkout -> launch review
```

Merge gates: every PR is documentation/implementation scoped, passes `npm ci`, lint, test, build, diff check and conflict scan; migrations run staging first and include rollback/backfill/RLS/compatibility review; migration history follows the [environment-specific canonicalization decision](migration-history-canonicalization.md); staging has removable identified data and no real mail/live Mollie payment; payment/email writes include idempotency and negative tests; no production deployment or merge is implied by a draft PR. A1 must merge before any endpoint/UI action uses real admin data. A3 must pass manual action and audit review before customer-facing invitation/payment/shipping mail. A4 depends on paid-event correctness. Production A4 additionally requires the Production baseline provenance gap to be reconstructed or accepted as a controlled historical exception. Woo provisioning needs a separate security, legal/tax, backup and owner approval gate.

Recommended Admin PRs: **A1** auth/roles/schema/API contracts/tests; **A2** shell/navigation/dashboard/read-only lists; **A3** invitations, manual quotes, fulfilment, email history; **A4** reports/CSV/polish. Do not make one large dashboard PR.
