# Dependencies and release gates

```text
ADR approval (auth, ownership, shipping, topology, product ID)
  -> A1 auth + schema/API contracts
       -> A2 real read integration -> A3 operational writes -> A4 reporting
  -> frontend mock shell (parallel, merge only after A1 contract)
  -> QA/security review (parallel)
  -> Woo research spike -> Pascal approval -> hosting/staging/install -> test-mode checkout -> launch review
```

Merge gates: every PR is documentation/implementation scoped, passes `npm ci`, lint, test, build, diff check and conflict scan; migrations include rollback/backfill/RLS review; payment/email writes include idempotency and negative tests; no production deployment or merge is implied by a draft PR. A1 must merge before any endpoint/UI action uses real admin data. A3 must pass manual action and audit review before customer-affecting sends. A4 depends on paid-event correctness. Woo provisioning needs a separate security, legal/tax, backup and owner approval gate.

Recommended Admin PRs: **A1** auth/roles/schema/API contracts/tests; **A2** shell/navigation/dashboard/read-only lists; **A3** invitations, manual quotes, fulfilment, email history; **A4** reports/CSV/polish. Do not make one large dashboard PR.
