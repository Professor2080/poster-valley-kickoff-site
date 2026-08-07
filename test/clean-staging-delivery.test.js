import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertMigrationState,
  createPlanDigest,
  parseExpectedVersions,
  parseMigrationList,
} from '../scripts/database/clean-staging-delivery.mjs';

test('parses exact expected migration versions', () => {
  assert.deepEqual(parseExpectedVersions('NONE'), []);
  assert.deepEqual(parseExpectedVersions('20260731113000,20260731193947'), [
    '20260731113000',
    '20260731193947',
  ]);
  assert.throws(() => parseExpectedVersions('20260731113000,20260731113000'), /DUPLICATE/);
  assert.throws(() => parseExpectedVersions('latest'), /FORMAT/);
});

test('parses Supabase migration list without retaining unrelated output', () => {
  const parsed = parseMigrationList(`
    LOCAL           │ REMOTE          │ TIME (UTC)
    20260731113000  │ 20260731113000  │ 2026-07-31
    20260731193947  │                 │ 2026-07-31
  `);
  assert.deepEqual(parsed, {
    local: ['20260731113000', '20260731193947'],
    remote: ['20260731113000'],
  });
});

test('requires remote history to be an exact local prefix and pending scope to match', () => {
  const state = {
    filesystem: ['20260731113000', '20260731193947'],
    listedLocal: ['20260731113000', '20260731193947'],
    remote: ['20260731113000'],
    expectedPending: ['20260731193947'],
  };
  assert.deepEqual(assertMigrationState(state), ['20260731193947']);
  assert.throws(
    () => assertMigrationState({ ...state, remote: ['20260731193947'] }),
    /REMOTE_HISTORY_NOT_LOCAL_PREFIX/,
  );
  assert.throws(
    () => assertMigrationState({ ...state, expectedPending: [] }),
    /PENDING_SCOPE_MISMATCH/,
  );
});

test('binds plan digest to candidate, remote history and pending scope', () => {
  const base = {
    workflowSha: 'b'.repeat(40),
    candidateSha: 'a'.repeat(40),
    remoteVersions: ['20260731113000'],
    pendingVersions: ['20260731193947'],
  };
  const digest = createPlanDigest(base);
  assert.match(digest, /^[0-9a-f]{64}$/);
  assert.notEqual(digest, createPlanDigest({ ...base, pendingVersions: [] }));
  assert.notEqual(digest, createPlanDigest({ ...base, workflowSha: 'c'.repeat(40) }));
});
