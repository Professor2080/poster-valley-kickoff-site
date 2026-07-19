# ADR-003: Shipping source of truth

**Status:** Proposed — Pascal approval required.

Make a versioned custom server-side product/shipping registry authoritative for custom quote amounts. The current server data (`api/_drops.js`) remains authoritative during phased migration; `src/data/drops.ts` is presentation duplication only. Target profiles include dimensions, packaging, weight, regions/rules, manual review and carrier mapping. Snapshot rules/amounts on orders. Introduce parity tests and a rollback before replacing hard-coded values; client data never calculates payable amount.
