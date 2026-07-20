# A3 staging handoff

This draft does not authorize a deployment, migration, customer email, or payment.

1. Review the additive migration `20260720110000_admin_operational_actions.sql`, including its rollback comment, then apply it only to the isolated Staging Supabase project.
2. Use newly created, removable `A3-STAGING-*` fixture rows and an approved manager UUID. Do not use customer or Production data.
3. Verify RLS remains enabled and browser clients have no mutation policies for the new tables.
4. Confirm a manager can approve a manual quote and an operator cannot; confirm unauthenticated users cannot invoke an action.
5. Confirm invitation preparation records a **suppressed** email event. This implementation deliberately never delivers email. A real Staging email requires Pascal's separate written approval and a subsequent reviewed integration.
6. Confirm provider-confirmed `paid` is required before the staged fulfilment transitions, and that carrier/tracking are required for `shipped`.
7. Do not create Mollie payments, write WooCommerce, deploy, merge, or access Production as part of this handoff.
