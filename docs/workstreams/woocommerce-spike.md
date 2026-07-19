# Worker brief: WooCommerce Architecture and Staging Spike

**Goal:** produce a decision-ready Woo topology/hosting/staging implementation plan; do not provision or install. **Branch / draft PR:** `codex/woocommerce-architecture-spike` / `Spike: WooCommerce staging architecture`.

**Prerequisites/dependencies:** ADR-002/004/005 approved; Pascal permits research. **Own:** `docs/woocommerce/**` (create) and scoped architecture additions. **Do not modify:** application code, APIs, schema, public config, existing workstream contracts.

**Scope/deliverables:** compare managed host candidates/capabilities, proposed staging/backup/rollback/security operations, native theme/child-theme plan, ~10-product model/SKU/weight/dimensions/classes, NL/EU/manual shipping approach, Mollie Woo test-mode checklist, email/legal content ownership, carrier/tax/customs/invoice research questions and acceptance criteria.

**Allowed:** repository/document research, safe public documentation research, docs-only PR. **Forbidden:** buy hosting, create DNS/domain/staging, install WordPress/Woo/plugins, use Mollie credentials/test payment, deploy, alter production, merge. **Tests:** markdown link/consistency review, `git diff --check`, conflict scan; run npm checks only if repository docs change policy requires. **Done:** explicit unknowns/owner decisions and a staged, reversible next-step plan; handoff to Pascal and release reviewer.
