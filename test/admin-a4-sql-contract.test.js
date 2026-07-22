import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const sql = await readFile(new URL('../supabase/migrations/20260722111632_admin_reporting_exports.sql', import.meta.url), 'utf8')
const reportFunction = sql.slice(sql.indexOf('create or replace function public.admin_a4_report'), sql.indexOf('create or replace function public.admin_a4_export_rows'))
const exportFunction = sql.slice(sql.indexOf('create or replace function public.admin_a4_export('), sql.indexOf('revoke all on function public.admin_a4_report'))

test('all A4 functions are manager checked, security definer and service-role only', () => {
  for (const name of ['admin_a4_report', 'admin_a4_export_rows', 'admin_a4_export_preview', 'admin_a4_export']) {
    assert.match(sql, new RegExp(`function public\\.${name}[\\s\\S]*security definer set search_path = public, pg_temp`, 'i'))
    assert.match(sql, new RegExp(`revoke all on function public\\.${name}\\([^;]+ from public, anon, authenticated`, 'i'))
    assert.match(sql, new RegExp(`grant execute on function public\\.${name}\\([^;]+ to service_role`, 'i'))
  }
  assert.match(reportFunction, /role = 'manager'[\s\S]*revoked_at is null/)
  assert.doesNotMatch(sql, /grant execute[^;]+to (?:anon|authenticated)/i)
})

test('paid reporting selects one provider-confirmed amount-matching payment per order', () => {
  assert.match(reportFunction, /select distinct on \(p[.]order_id\)/i)
  for (const evidence of ["p.provider = 'mollie'", "p.status = 'paid'", 'provider_payment_id', 'webhook_received_at is not null', 'p.paid_at is not null', 'p.amount = o.total_amount', 'p.currency = o.currency']) assert.match(reportFunction, new RegExp(evidence.replaceAll('.', '[.]'), 'i'))
  assert.match(reportFunction, /sum\(total_amount\)/i)
  assert.match(reportFunction, /group by currency/i)
  assert.doesNotMatch(reportFunction, /sum\(p[.]amount\)/i)
  assert.match(reportFunction, /refundSupport'[\s\S]*false/i)
})

test('conversion denominators and timestamp boundaries are fixed in the database contract', () => {
  assert.match(reportFunction, /reservation_scope[\s\S]*r[.]created_at >= p_from[\s\S]*r[.]created_at < p_to/i)
  assert.match(reportFunction, /invitation_scope[\s\S]*i[.]sent_at >= p_from[\s\S]*i[.]sent_at < p_to/i)
  assert.match(reportFunction, /order_scope[\s\S]*o[.]created_at >= p_from[\s\S]*o[.]created_at < p_to/i)
  assert.match(reportFunction, /reservationToInvitation[\s\S]*numerator[\s\S]*denominator[\s\S]*invitationToOrder[\s\S]*orderToPaid/i)
  assert.match(reportFunction, /paid_scope[\s\S]*cp[.]paid_at >= p_from[\s\S]*cp[.]paid_at < p_to/i)
})

test('exports are fixed, bounded, PII-minimized and safely audited', () => {
  assert.match(sql, /p_export_type not in \('reservations','invitations','orders','payments','fulfilment','summary'\)/i)
  assert.match(sql, /p_to - p_from > interval '90 days'/i)
  assert.match(sql, /limit 2001/i)
  assert.match(exportFunction, /row_count > 2000[\s\S]*export_limit_exceeded/i)
  assert.match(sql, /contentFingerprint[\s\S]*content_fingerprint/i)
  assert.match(exportFunction, /content_fingerprint <> p_expected_fingerprint[\s\S]*confirmation_stale/i)
  assert.match(exportFunction, /insert into public[.]admin_audit_events/i)
  assert.match(exportFunction, /export_type[\s\S]*filters[\s\S]*record_count[\s\S]*contains_personal_contact_or_address_data'[\s\S]*false/i)
  assert.doesNotMatch(exportFunction, /full_name|masked_email|address_line1|postal_code|token_hash|provider_payment_id|tracking_number|metadata/i)
  assert.doesNotMatch(sql, /delete from|update public[.](orders|payments|order_invitations|drop_interest_requests)/i)
})
