import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  assertRebuildAuthorization,
  assertMigrationState,
  createPlanDigest,
  createRebuildInvocation,
  parseExpectedVersions,
  parseMigrationList,
} from '../scripts/database/clean-staging-delivery.mjs';

test('protected workflow independently gates the destructive rebuild operation', () => {
  const workflow = readFileSync('.github/workflows/clean-staging-database.yml', 'utf8');
  for (const required of [
    '- rebuild',
    'environment: clean-staging',
    '[[ "$CANDIDATE_SHA" == "$GITHUB_SHA" ]]',
    '[[ "${{ inputs.expected_pending_versions }}" == "NONE" ]]',
    '[[ "$REBUILD_CONFIRMATION" == "REBUILD $EXPECTED_PROJECT_REF" ]]',
  ]) {
    assert.ok(workflow.includes(required), `missing rebuild gate: ${required}`);
  }
});

test('uses the official linked reset without automatic seed data', () => {
  assert.deepEqual(createRebuildInvocation(), {
    args: ['db', 'reset', '--linked', '--no-seed'],
    input: 'y\n',
  });
});

test('allows rebuild only for exact main with empty pending scope and explicit target confirmation', () => {
  const allowed = {
    operation: 'rebuild',
    expectedPending: [],
    approvedDigest: '',
    confirmation: 'REBUILD stbunwkgvxfwmbjivgos',
    workflowSha: 'a'.repeat(40),
    candidateSha: 'a'.repeat(40),
  };
  assert.doesNotThrow(() => assertRebuildAuthorization(allowed));
  assert.throws(
    () => assertRebuildAuthorization({ ...allowed, expectedPending: ['20260731113000'] }),
    /REBUILD_PENDING_SCOPE_NOT_NONE/,
  );
  assert.throws(
    () => assertRebuildAuthorization({ ...allowed, approvedDigest: 'b'.repeat(64) }),
    /REBUILD_PLAN_DIGEST_NOT_ALLOWED/,
  );
  assert.throws(
    () => assertRebuildAuthorization({ ...allowed, confirmation: 'REBUILD another-project' }),
    /REBUILD_CONFIRMATION_INVALID/,
  );
  assert.throws(
    () => assertRebuildAuthorization({ ...allowed, candidateSha: 'b'.repeat(40) }),
    /REBUILD_CANDIDATE_NOT_MAIN/,
  );
});

test('parses exact expected migration versions', () => {
  assert.deepEqual(parseExpectedVersions('NONE'), []);
  assert.deepEqual(parseExpectedVersions('20260731113000,20260731193947'), [
    '20260731113000',
    '20260731193947',
  ]);
  assert.throws(() => parseExpectedVersions('20260731113000,20260731113000'), /DUPLICATE/);
  assert.throws(() => parseExpectedVersions('latest'), /FORMAT/);
});

test('parses the Supabase CLI 2.111.0 table without retaining unrelated output', () => {
  const parsed = parseMigrationList(`
    LOCAL               | REMOTE              | TIME (UTC)
    --------------------|---------------------|--------------------
    \`20260731113000\`  | \`20260731113000\`  | \`2026-07-31 11:30:00\`
    \`20260731193947\`  | \` \`               | \`2026-07-31 19:39:47\`
  `);
  assert.deepEqual(parsed, {
    local: ['20260731113000', '20260731193947'],
    remote: ['20260731113000'],
  });
  assert.deepEqual(
    parseMigrationList(
      '  | \u001b[32m`20260731113000`\u001b[0m | \u001b[32m`20260731113000`\u001b[0m | 2026-07-31 |',
    ),
    {
      local: ['20260731113000'],
      remote: ['20260731113000'],
    },
  );
  assert.deepEqual(parseMigrationList('status 20260731113000 without table cells'), {
    local: [],
    remote: [],
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
