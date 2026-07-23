# A4 reporting and controlled exports — Staging handoff

This runbook does not authorize a remote migration, deployment, email, payment, merge or Production
access. A4 is additive and remains local until the PR is reviewed and Pascal separately approves the
isolated Staging procedure below.

## Fixed environment boundary

- The only permitted remote validation target is Poster Valley Kickoff Staging,
  `cdmocdodehjmcgtxicaj`.
- Stop immediately if a command, dashboard or credential targets Production,
  `epqpeoubkbftcvxjbqeo`, or any unknown project.
- Never use customer data, a Production service-role key, a live Mollie key or operational Resend
  delivery for A4 validation.
- Confirm the reviewed A1, A1 hardening, A3 and A3.2 migration history is present before A4. Do not
  amend or replay registered migration files.

## Deployment function budget

The deployable API inventory is fixed at 12 Serverless Functions for the Vercel Hobby plan. A4 uses
one `POST /api/admin/reporting` function with the allowlisted operations `report`, `export_preview`
and `export_download`. Read-only admin authorization and delivery configuration share
`GET /api/admin/status` with allowlisted operations. The compatibility rewrites for the former
status URLs do not create additional functions. Run `test/vercel-function-budget.test.js` whenever
adding or moving a file below `api/`; helper modules must not export a default handler.

## Migration and database checks

1. Review `supabase/migrations/20260722111632_admin_reporting_exports.sql` and confirm it creates only
   the four `admin_a4_*` functions and their grants. Apply exactly that migration to the checked
   Staging ref using the approved migration workflow; do not use an unchecked `db push`.
2. Confirm all four functions are `SECURITY DEFINER`, have a restricted `search_path`, reject an
   inactive/non-manager actor and expose execute only to `service_role`.
3. Run Supabase Database Linter and Security/Performance Advisors. Record every finding. Inspect
   `EXPLAIN (ANALYZE, BUFFERS)` for representative 7-, 30- and 90-day report/export queries before
   proposing indexes; do not add speculative indexes to this PR.
4. Verify the append-only protection on `admin_audit_events` still prevents update/delete and that
   report preview creates no audit event.

## Removable fixtures

Create only synthetic rows with recognizable `A4-STAGING-DELETE-*` references and
`record_origin = 'test'`. Include:

- two designs and at least two destination countries;
- reservations with and without sent invitations;
- a sent invitation with no order and one with an order;
- paid, open, failed and expired payment rows;
- a duplicate/replayed paid payment for one order;
- an invalid `paid` row whose amount or currency differs from its order;
- EUR data and one second synthetic currency to prove totals remain separated;
- open, attention-needed and shipped fulfilment rows;
- pending, failed and sent invitation-delivery attempts;
- one operator and one non-admin identity in addition to the approved manager.

Keep email addresses synthetic and do not use deliverable domains. Disable operational invitation
delivery and do not call payment creation or webhook endpoints.

## Required Staging assertions

1. Missing/expired authentication returns `401`; non-admin and operator access to report/export
   returns `403`; the approved manager can read and export.
2. Unknown reporting operations return `400` without calling an operational RPC. Confirm report and
   export-preview responses are JSON and confirmed export-download responses are CSV.
3. Default reports exclude `test` and `internal_pilot`; explicit inclusion exposes the fixtures.
4. Periods use half-open UTC boundaries and custom ranges over 366 days fail. Test the day before and
   after a DST transition without changing stored UTC timestamps.
5. Counts, fixed-cohort conversions, product/country filters and attention queues equal manually
   calculated fixture expectations.
6. Paid gross revenue and AOV include only the canonical valid paid payment, count a replayed payment
   once, reject the amount/currency mismatch and keep currencies separate.
7. Export preview is non-mutating. Download requires the matching short-lived manager proof, refuses
   periods over 90 days and refuses more than 2,000 rows.
8. CSV columns match the fixed allowlist. Verify absence of names, emails, addresses, postal data,
   tokens/hashes/links, provider payment IDs, tracking values, metadata, audit payloads and secrets.
9. Seed a text value beginning with each of `=`, `+`, `-` and `@`; confirm the CSV neutralizes all
   four without changing the database value.
10. A successful export appends exactly one minimized audit event with actor, export type, normalized
   filters and record count, but no exported row or PII.
11. In an authenticated Preview deployment, inspect `/admin` as manager at desktop and mobile widths;
    verify keyboard navigation, loading/error/empty/success states, filters, confirmation focus and a
    downloaded CSV. Confirm the browser console has no errors. Operators must not see Reporting.

## Cleanup and rollback

Delete only the explicitly enumerated A4 fixture lineages after preserving the test evidence. Verify
that no customer, pilot or Production row is selected before cleanup. Audit events are append-only;
do not delete them merely to make the environment look clean—retain the minimized test evidence or
follow the approved retention procedure.

If A4 must be disabled, remove the reporting UI/API rollout first. Prefer a reviewed forward migration
that revokes execute on `admin_a4_report`, `admin_a4_export_rows`, `admin_a4_export_preview` and
`admin_a4_export`. Drop functions only after confirming no approved consumer uses them; never drop
`admin_audit_events` or shared A1–A3 objects. Production remains unchanged throughout this handoff.
