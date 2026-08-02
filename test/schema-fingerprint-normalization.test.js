import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
import { fingerprintTextItems, normalizeNewlines } from '../scripts/database/schema-fingerprint.mjs'

const functionDefinition = `routine|public.shipping_fixture()|true|search_path=public, pg_temp|CREATE OR REPLACE FUNCTION public.shipping_fixture()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  perform 1;
end;
$function$`

test('LF and CRLF PostgreSQL function definitions have the same fingerprint', () => {
  const lfItems = ['relation|public.orders|r|true|', functionDefinition]
  const crlfItems = lfItems.map((item) => item.replace(/\n/gu, '\r\n'))

  assert.equal(fingerprintTextItems(crlfItems), fingerprintTextItems(lfItems))
  assert.deepEqual(lfItems, ['relation|public.orders|r|true|', functionDefinition])
})

test('lone carriage returns canonicalize to the same LF fingerprint', () => {
  const crItems = [functionDefinition.replace(/\n/gu, '\r')]
  assert.equal(fingerprintTextItems(crItems), fingerprintTextItems([functionDefinition]))
  assert.equal(normalizeNewlines('one\r\ntwo\rthree'), 'one\ntwo\nthree')
})

test('content differences still produce different fingerprints', () => {
  const changedDefinition = functionDefinition.replace('perform 1;', 'perform 2;')
  assert.notEqual(fingerprintTextItems([changedDefinition]), fingerprintTextItems([functionDefinition]))
})

test('newline normalization leaves non-string values and migration bytes unchanged', () => {
  const object = { value: 'line one\r\nline two' }
  const bytes = Buffer.from('migration bytes\r\nremain byte exact', 'utf8')
  const migrationHash = createHash('sha256').update(bytes).digest('hex')

  for (const value of [object, bytes, 17, false, null, undefined]) {
    assert.strictEqual(normalizeNewlines(value), value)
  }
  assert.equal(createHash('sha256').update(bytes).digest('hex'), migrationHash)
})
