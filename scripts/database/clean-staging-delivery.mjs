import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

export const CLEAN_STAGING_PROJECT_REF = 'stbunwkgvxfwmbjivgos';
export const PINNED_SUPABASE_CLI_VERSION = '2.111.0';

const MIGRATION_FILE = /^(\d{14})_[a-z0-9_]+\.sql$/;
const SHA_40 = /^[0-9a-f]{40}$/;
const DIGEST_64 = /^[0-9a-f]{64}$/;

export function parseExpectedVersions(value) {
  const normalized = String(value ?? '').trim();
  if (normalized === 'NONE') return [];
  const versions = normalized.split(',').map((item) => item.trim());
  if (versions.length === 0 || versions.some((version) => !/^\d{14}$/.test(version))) {
    throw new Error('EXPECTED_PENDING_FORMAT');
  }
  if (new Set(versions).size !== versions.length) throw new Error('EXPECTED_PENDING_DUPLICATE');
  return versions;
}

export function parseMigrationList(output) {
  const local = [];
  const remote = [];
  const normalized = String(output)
    .replace(/\u001b\[[0-9;]*m/g, '')
    .replaceAll('`', '')
    .replaceAll('│', '|');
  for (const line of normalized.split(/\r?\n/)) {
    const match = line.match(/^\s*\|?\s*(\d{14})?\s*\|\s*(\d{14})?\s*\|/);
    if (!match) continue;
    if (match[1]) local.push(match[1]);
    if (match[2]) remote.push(match[2]);
  }
  return { local, remote };
}

export function assertMigrationState({ filesystem, listedLocal, remote, expectedPending }) {
  const unique = (items) => new Set(items).size === items.length;
  if (![filesystem, listedLocal, remote].every(unique)) throw new Error('MIGRATION_VERSION_DUPLICATE');
  if (filesystem.join(',') !== listedLocal.join(',')) throw new Error('LOCAL_MIGRATION_LIST_MISMATCH');
  if (remote.join(',') !== filesystem.slice(0, remote.length).join(',')) {
    throw new Error('REMOTE_HISTORY_NOT_LOCAL_PREFIX');
  }
  const pending = filesystem.slice(remote.length);
  if (pending.join(',') !== expectedPending.join(',')) throw new Error('PENDING_SCOPE_MISMATCH');
  return pending;
}

export function createPlanDigest({ workflowSha, candidateSha, remoteVersions, pendingVersions }) {
  const evidence = JSON.stringify({
    schema: 1,
    projectRef: CLEAN_STAGING_PROJECT_REF,
    workflowSha,
    candidateSha,
    cliVersion: PINNED_SUPABASE_CLI_VERSION,
    remoteVersions,
    pendingVersions,
  });
  return createHash('sha256').update(evidence).digest('hex');
}

export function assertRebuildAuthorization({
  operation,
  expectedPending,
  approvedDigest,
  confirmation,
  workflowSha,
  candidateSha,
}) {
  if (operation !== 'rebuild') return;
  if (expectedPending.length !== 0) throw new Error('REBUILD_PENDING_SCOPE_NOT_NONE');
  if (approvedDigest) throw new Error('REBUILD_PLAN_DIGEST_NOT_ALLOWED');
  if (confirmation !== `REBUILD ${CLEAN_STAGING_PROJECT_REF}`) {
    throw new Error('REBUILD_CONFIRMATION_INVALID');
  }
  if (workflowSha !== candidateSha) throw new Error('REBUILD_CANDIDATE_NOT_MAIN');
}

export function createRebuildInvocation() {
  return {
    args: ['db', 'reset', '--linked', '--no-seed'],
    input: 'y\n',
  };
}

function fail(code, phase = 'VALIDATE', exitCode = 1) {
  process.stdout.write(`${JSON.stringify({ ok: false, code, phase })}\n`);
  process.exit(exitCode);
}

function runSupabase(args, phase, { input } = {}) {
  const trustedRoot = process.env.TRUSTED_ROOT;
  const candidateRoot = process.env.CANDIDATE_ROOT;
  if (!trustedRoot || !candidateRoot) fail('WORKSPACE_ROOTS_MISSING');
  const command = join(trustedRoot, 'node_modules', '.bin', process.platform === 'win32' ? 'supabase.cmd' : 'supabase');
  const result = spawnSync(command, args, {
    cwd: candidateRoot,
    env: process.env,
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
    windowsHide: true,
    input,
  });
  if (result.error || result.status !== 0) fail('SUPABASE_COMMAND_FAILED', phase, 20);
  return result.stdout;
}

async function migrationInventory(root) {
  const names = (await readdir(join(root, 'supabase', 'migrations'))).sort();
  const entries = [];
  for (const name of names) {
    const match = name.match(MIGRATION_FILE);
    if (!match) throw new Error('INVALID_MIGRATION_FILENAME');
    entries.push({
      name,
      version: match[1],
      content: await readFile(join(root, 'supabase', 'migrations', name)),
    });
  }
  if (entries.length === 0) throw new Error('NO_MIGRATIONS');
  return entries;
}

async function assertTrustedMigrations() {
  const trustedRoot = process.env.TRUSTED_ROOT;
  const candidateRoot = process.env.CANDIDATE_ROOT;
  if (!trustedRoot || !candidateRoot) throw new Error('WORKSPACE_ROOTS_MISSING');
  const [trusted, candidate] = await Promise.all([
    migrationInventory(trustedRoot),
    migrationInventory(candidateRoot),
  ]);
  const candidateByName = new Map(candidate.map((entry) => [entry.name, entry]));
  for (const trustedEntry of trusted) {
    const candidateEntry = candidateByName.get(trustedEntry.name);
    if (!candidateEntry || !candidateEntry.content.equals(trustedEntry.content)) {
      throw new Error('MAIN_MIGRATION_CHANGED');
    }
  }
  return candidate.map((entry) => entry.version);
}

async function linkedProjectRef() {
  const candidateRoot = process.env.CANDIDATE_ROOT;
  if (!candidateRoot) throw new Error('CANDIDATE_ROOT_MISSING');
  return (await readFile(join(candidateRoot, 'supabase', '.temp', 'project-ref'), 'utf8')).trim();
}

async function assertTrustedConfig() {
  const trustedRoot = process.env.TRUSTED_ROOT;
  const candidateRoot = process.env.CANDIDATE_ROOT;
  if (!trustedRoot || !candidateRoot) throw new Error('WORKSPACE_ROOTS_MISSING');
  const [trusted, candidate] = await Promise.all([
    readFile(join(trustedRoot, 'supabase', 'config.toml'), 'utf8'),
    readFile(join(candidateRoot, 'supabase', 'config.toml'), 'utf8'),
  ]);
  if (trusted !== candidate) throw new Error('SUPABASE_CONFIG_CHANGED');
}

async function main() {
  const [operation, expectedRaw, approvedDigest = '', rebuildConfirmation = ''] = process.argv.slice(2);
  if (!['plan', 'apply', 'rebuild'].includes(operation)) throw new Error('OPERATION_INVALID');
  if (process.env.POSTER_VALLEY_ENV !== 'clean-staging') throw new Error('ENVIRONMENT_INVALID');
  if (process.env.CLEAN_STAGING_PROJECT_REF !== CLEAN_STAGING_PROJECT_REF) {
    throw new Error('PROJECT_REF_INVALID');
  }
  if (process.env.GITHUB_REPOSITORY !== 'Professor2080/poster-valley-kickoff-site') {
    throw new Error('REPOSITORY_INVALID');
  }
  const candidateSha = String(process.env.CANDIDATE_SHA ?? '').trim();
  if (!SHA_40.test(candidateSha)) throw new Error('CANDIDATE_SHA_INVALID');
  const workflowSha = String(process.env.GITHUB_SHA ?? '').trim();
  if (!SHA_40.test(workflowSha)) throw new Error('WORKFLOW_SHA_INVALID');
  if (!process.env.SUPABASE_ACCESS_TOKEN || !process.env.SUPABASE_DB_PASSWORD) {
    throw new Error('CREDENTIALS_MISSING');
  }

  const expectedPending = parseExpectedVersions(expectedRaw);
  assertRebuildAuthorization({
    operation,
    expectedPending,
    approvedDigest,
    confirmation: rebuildConfirmation,
    workflowSha,
    candidateSha,
  });
  await assertTrustedConfig();
  const localVersions = await assertTrustedMigrations();
  const version = runSupabase(['--version'], 'CLI_VERSION').trim();
  if (version !== PINNED_SUPABASE_CLI_VERSION) throw new Error('CLI_VERSION_MISMATCH');

  runSupabase(['link', '--project-ref', CLEAN_STAGING_PROJECT_REF], 'LINK');
  if ((await linkedProjectRef()) !== CLEAN_STAGING_PROJECT_REF) throw new Error('LINK_TARGET_MISMATCH');

  const before = parseMigrationList(runSupabase(['migration', 'list', '--linked'], 'LIST_BEFORE'));
  const pending = assertMigrationState({
    filesystem: localVersions,
    listedLocal: before.local,
    remote: before.remote,
    expectedPending,
  });

  runSupabase(['db', 'push', '--linked', '--dry-run'], 'DRY_RUN');
  const afterDryRun = parseMigrationList(runSupabase(['migration', 'list', '--linked'], 'LIST_AFTER_DRY_RUN'));
  assertMigrationState({
    filesystem: localVersions,
    listedLocal: afterDryRun.local,
    remote: afterDryRun.remote,
    expectedPending,
  });
  if (before.remote.join(',') !== afterDryRun.remote.join(',')) throw new Error('DRY_RUN_MUTATED_HISTORY');

  const planDigest = createPlanDigest({
    workflowSha,
    candidateSha,
    remoteVersions: before.remote,
    pendingVersions: pending,
  });

  if (operation === 'apply') {
    if (pending.length === 0) throw new Error('EMPTY_APPLY_BLOCKED');
    if (!DIGEST_64.test(approvedDigest) || approvedDigest !== planDigest) {
      throw new Error('PLAN_DIGEST_MISMATCH');
    }
    runSupabase(['db', 'push', '--linked'], 'APPLY');
    const afterApply = parseMigrationList(runSupabase(['migration', 'list', '--linked'], 'LIST_AFTER_APPLY'));
    assertMigrationState({
      filesystem: localVersions,
      listedLocal: afterApply.local,
      remote: afterApply.remote,
      expectedPending: [],
    });
  }

  let afterRebuild = null;
  if (operation === 'rebuild') {
    const rebuild = createRebuildInvocation();
    runSupabase(rebuild.args, 'REBUILD', { input: rebuild.input });
    afterRebuild = parseMigrationList(runSupabase(['migration', 'list', '--linked'], 'LIST_AFTER_REBUILD'));
    assertMigrationState({
      filesystem: localVersions,
      listedLocal: afterRebuild.local,
      remote: afterRebuild.remote,
      expectedPending: [],
    });
    runSupabase(['db', 'push', '--linked', '--dry-run'], 'DRY_RUN_AFTER_REBUILD');
    const afterRebuildDryRun = parseMigrationList(
      runSupabase(['migration', 'list', '--linked'], 'LIST_AFTER_REBUILD_DRY_RUN'),
    );
    assertMigrationState({
      filesystem: localVersions,
      listedLocal: afterRebuildDryRun.local,
      remote: afterRebuildDryRun.remote,
      expectedPending: [],
    });
    if (afterRebuild.remote.join(',') !== afterRebuildDryRun.remote.join(',')) {
      throw new Error('REBUILD_DRY_RUN_MUTATED_HISTORY');
    }
  }

  process.stdout.write(`${JSON.stringify({
    ok: true,
    operation,
    projectRef: CLEAN_STAGING_PROJECT_REF,
    workflowSha,
    candidateSha,
    cliVersion: PINNED_SUPABASE_CLI_VERSION,
    remoteVersions: before.remote,
    pendingVersions: pending,
    planDigest,
    applied: operation === 'apply',
    rebuilt: operation === 'rebuild',
    afterRebuildVersions: afterRebuild?.remote ?? null,
  })}\n`);
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href) {
  main().catch((error) => fail(error instanceof Error ? error.message : 'UNEXPECTED_ERROR'));
}
