import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { pathsEqual } from '../scripts/tooling/preflight.mjs'

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
)
const preflightScript = path.join(
  repositoryRoot,
  'scripts',
  'tooling',
  'preflight.mjs',
)

function git(cwd, ...args) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
}

function runPreflight({
  branch,
  commonDirectory,
  continueExistingChanges = false,
  expectedHead,
  expectedRoot,
  mode = 'change',
  remote,
  role = 'active',
  root,
}) {
  const args = [
    preflightScript,
    '--role',
    role,
    '--mode',
    mode,
    '--expected-root',
    expectedRoot ?? root,
    '--expected-common-directory',
    commonDirectory,
    '--expected-branch',
    branch,
    '--expected-remote',
    remote,
    '--skip-remote-lookup',
  ]
  if (expectedHead) args.push('--expected-head', expectedHead)
  if (continueExistingChanges) args.push('--continue-existing-changes')
  return spawnSync(process.execPath, args, {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, POSTER_VALLEY_PREFLIGHT_TEST: '1' },
  })
}

function repositorySnapshot(root) {
  const upstream = spawnSync(
    'git',
    ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'],
    { cwd: root, encoding: 'utf8' },
  )
  return {
    branch: git(root, 'branch', '--show-current'),
    head: git(root, 'rev-parse', 'HEAD'),
    status: git(root, 'status', '--porcelain=v1', '--untracked-files=all'),
    upstream: upstream.status === 0 ? upstream.stdout.trim() : null,
  }
}

test('preflight enforces active, reference, archive, branch, HEAD, upstream, and status contracts', async (t) => {
  const fixtureRoot = mkdtempSync(path.join(tmpdir(), 'pv-preflight-'))
  const remote = path.join(fixtureRoot, 'origin.git')
  const seed = path.join(fixtureRoot, 'seed')
  const active = path.join(fixtureRoot, 'active')
  const pushed = path.join(fixtureRoot, 'pushed')
  const wrongUpstream = path.join(fixtureRoot, 'wrong-upstream')
  const archive = path.join(fixtureRoot, 'archive')
  const detached = path.join(fixtureRoot, 'detached')
  const wrongRepository = path.join(fixtureRoot, 'wrong-repository')

  try {
    execFileSync('git', ['init', '--bare', '--initial-branch=main', remote])
    execFileSync('git', ['init', '--initial-branch=main', seed])
    git(seed, 'config', 'user.email', 'tooling@example.test')
    git(seed, 'config', 'user.name', 'Tooling Fixture')
    writeFileSync(
      path.join(seed, 'package.json'),
      '{"name":"poster-valley-kickoff-site","private":true}\n',
    )
    git(seed, 'add', 'package.json')
    git(seed, 'commit', '-m', 'synthetic baseline')
    git(seed, 'remote', 'add', 'origin', remote)
    git(seed, 'push', '-u', 'origin', 'main')

    for (const branch of [
      'codex/no-upstream',
      'codex/pushed',
      'codex/wrong-upstream',
      'codex/archive-fixture',
    ]) {
      git(seed, 'branch', branch)
    }
    git(seed, 'push', 'origin', 'codex/pushed')
    git(seed, 'worktree', 'add', active, 'codex/no-upstream')
    git(seed, 'worktree', 'add', pushed, 'codex/pushed')
    git(seed, 'worktree', 'add', wrongUpstream, 'codex/wrong-upstream')
    git(seed, 'worktree', 'add', archive, 'codex/archive-fixture')
    git(seed, 'worktree', 'add', '--detach', detached, 'HEAD')
    git(pushed, 'branch', '--set-upstream-to=origin/codex/pushed')
    git(wrongUpstream, 'branch', '--set-upstream-to=origin/main')

    const commonDirectory = git(
      active,
      'rev-parse',
      '--path-format=absolute',
      '--git-common-dir',
    )
    const baselineHead = git(active, 'rev-parse', 'HEAD')

    await t.test('correct active worktree succeeds without upstream', () => {
      const result = runPreflight({
        branch: 'codex/no-upstream',
        commonDirectory,
        expectedHead: baselineHead,
        remote,
        root: active,
      })
      assert.equal(result.status, 0, result.stderr)
      assert.match(result.stdout, /Role\/mode:\s+active\/change/)
      assert.match(result.stdout, /Upstream:\s+none/)
    })

    await t.test('clean reference worktree fails for change mode', () => {
      const result = runPreflight({
        branch: 'main',
        commonDirectory,
        expectedHead: baselineHead,
        remote,
        role: 'reference',
        root: seed,
      })
      assert.equal(result.status, 1)
      assert.match(result.stderr, /read-only/)
    })

    await t.test('archive worktree fails for change mode', () => {
      const result = runPreflight({
        branch: 'codex/archive-fixture',
        commonDirectory,
        expectedHead: baselineHead,
        remote,
        role: 'archive',
        root: archive,
      })
      assert.equal(result.status, 1)
      assert.match(result.stderr, /read-only/)
    })

    await t.test('clean archive succeeds for read-only inspection', () => {
      const result = runPreflight({
        branch: 'codex/archive-fixture',
        commonDirectory,
        expectedHead: baselineHead,
        mode: 'inspect',
        remote,
        role: 'archive',
        root: archive,
      })
      assert.equal(result.status, 0, result.stderr)
      assert.match(result.stdout, /Role\/mode:\s+archive\/inspect/)
      assert.match(result.stdout, /Working tree:\s+clean/)
    })

    await t.test('dirty archive inspection reports status without mutation', () => {
      const dirtyFile = path.join(archive, 'synthetic-archive-note.txt')
      const contents = 'synthetic archive note\n'
      writeFileSync(dirtyFile, contents)
      try {
        const before = repositorySnapshot(archive)
        const result = runPreflight({
          branch: 'codex/archive-fixture',
          commonDirectory,
          expectedHead: baselineHead,
          mode: 'inspect',
          remote,
          role: 'archive',
          root: archive,
        })
        const after = repositorySnapshot(archive)
        assert.equal(result.status, 0, result.stderr)
        assert.match(result.stdout, /dirty \(1 entries; read-only inspection\)/)
        assert.match(result.stdout, /\?\? synthetic-archive-note\.txt/)
        assert.deepEqual(after, before)
        assert.equal(readFileSync(dirtyFile, 'utf8'), contents)
      } finally {
        unlinkSync(dirtyFile)
      }
    })

    await t.test('dirty reference inspection is read-only and change remains blocked', () => {
      const dirtyFile = path.join(seed, 'synthetic-reference-note.txt')
      writeFileSync(dirtyFile, 'synthetic reference note\n')
      try {
        const before = repositorySnapshot(seed)
        const inspected = runPreflight({
          branch: 'main',
          commonDirectory,
          expectedHead: baselineHead,
          mode: 'inspect',
          remote,
          role: 'reference',
          root: seed,
        })
        assert.equal(inspected.status, 0, inspected.stderr)
        assert.match(inspected.stdout, /reference\/inspect/)
        assert.match(inspected.stdout, /read-only inspection/)
        assert.deepEqual(repositorySnapshot(seed), before)

        const changed = runPreflight({
          branch: 'main',
          commonDirectory,
          expectedHead: baselineHead,
          remote,
          role: 'reference',
          root: seed,
        })
        assert.equal(changed.status, 1)
        assert.match(changed.stderr, /read-only/)
      } finally {
        unlinkSync(dirtyFile)
      }
    })

    await t.test('wrong branch fails', () => {
      const result = runPreflight({
        branch: 'codex/not-this-branch',
        commonDirectory,
        expectedHead: baselineHead,
        remote,
        root: active,
      })
      assert.equal(result.status, 1)
      assert.match(result.stderr, /Branch check failed/)
    })

    await t.test('main cannot be claimed as active', () => {
      const result = runPreflight({
        branch: 'main',
        commonDirectory,
        expectedHead: baselineHead,
        remote,
        role: 'active',
        root: seed,
      })
      assert.equal(result.status, 1)
      assert.match(result.stderr, /classified as 'reference'/)
    })

    await t.test('detached HEAD fails', () => {
      const result = runPreflight({
        branch: 'codex/detached',
        commonDirectory,
        expectedHead: baselineHead,
        remote,
        root: detached,
      })
      assert.equal(result.status, 1)
      assert.match(result.stderr, /Detached HEAD/)
    })

    await t.test('unexpected pinned HEAD fails', () => {
      const result = runPreflight({
        branch: 'codex/no-upstream',
        commonDirectory,
        expectedHead: '0'.repeat(40),
        remote,
        root: active,
      })
      assert.equal(result.status, 1)
      assert.match(result.stderr, /HEAD check failed/)
    })

    await t.test('origin/main upstream fails', () => {
      const result = runPreflight({
        branch: 'codex/wrong-upstream',
        commonDirectory,
        expectedHead: baselineHead,
        remote,
        root: wrongUpstream,
      })
      assert.equal(result.status, 1)
      assert.match(result.stderr, /Upstream check failed/)
    })

    await t.test('equal feature upstream succeeds after push', () => {
      const result = runPreflight({
        branch: 'codex/pushed',
        commonDirectory,
        expectedHead: baselineHead,
        remote,
        root: pushed,
      })
      assert.equal(result.status, 0, result.stderr)
      assert.match(result.stdout, /origin\/codex\/pushed/)
    })

    await t.test('unexpected different feature upstream fails', () => {
      git(active, 'branch', '--set-upstream-to=origin/codex/pushed')
      try {
        const result = runPreflight({
          branch: 'codex/no-upstream',
          commonDirectory,
          expectedHead: baselineHead,
          remote,
          root: active,
        })
        assert.equal(result.status, 1)
        assert.match(result.stderr, /Upstream check failed/)
      } finally {
        git(active, 'branch', '--unset-upstream')
      }
    })

    await t.test('dirty tree needs explicit continuation', () => {
      const dirtyFile = path.join(active, 'synthetic-untracked.txt')
      writeFileSync(dirtyFile, 'synthetic\n')
      try {
        const blocked = runPreflight({
          branch: 'codex/no-upstream',
          commonDirectory,
          expectedHead: baselineHead,
          remote,
          root: active,
        })
        assert.equal(blocked.status, 1)
        assert.match(blocked.stderr, /not clean/)

        const continued = runPreflight({
          branch: 'codex/no-upstream',
          commonDirectory,
          continueExistingChanges: true,
          expectedHead: baselineHead,
          remote,
          root: active,
        })
        assert.equal(continued.status, 0, continued.stderr)
        assert.match(continued.stdout, /explicitly continued/)
      } finally {
        unlinkSync(dirtyFile)
      }
    })

    await t.test('dirty active inspection reports without mutation', () => {
      const dirtyFile = path.join(active, 'synthetic-inspection-note.txt')
      writeFileSync(dirtyFile, 'synthetic active inspection note\n')
      try {
        const before = repositorySnapshot(active)
        const inspected = runPreflight({
          branch: 'codex/no-upstream',
          commonDirectory,
          expectedHead: baselineHead,
          mode: 'inspect',
          remote,
          root: active,
        })
        assert.equal(inspected.status, 0, inspected.stderr)
        assert.match(inspected.stdout, /active\/inspect/)
        assert.match(inspected.stdout, /read-only inspection/)
        assert.deepEqual(repositorySnapshot(active), before)
      } finally {
        unlinkSync(dirtyFile)
      }
    })

    await t.test('wrong repository identity fails', () => {
      execFileSync('git', ['init', '--initial-branch=codex/wrong', wrongRepository])
      git(wrongRepository, 'config', 'user.email', 'tooling@example.test')
      git(wrongRepository, 'config', 'user.name', 'Tooling Fixture')
      writeFileSync(
        path.join(wrongRepository, 'package.json'),
        '{"name":"different-project","private":true}\n',
      )
      git(wrongRepository, 'add', 'package.json')
      git(wrongRepository, 'commit', '-m', 'wrong repository')
      git(wrongRepository, 'remote', 'add', 'origin', remote)
      git(wrongRepository, 'fetch', 'origin', 'main:refs/remotes/origin/main')
      const wrongCommon = git(
        wrongRepository,
        'rev-parse',
        '--path-format=absolute',
        '--git-common-dir',
      )
      const result = runPreflight({
        branch: 'codex/wrong',
        commonDirectory: wrongCommon,
        expectedHead: git(wrongRepository, 'rev-parse', 'HEAD'),
        remote,
        root: wrongRepository,
      })
      assert.equal(result.status, 1)
      assert.match(result.stderr, /expected package/)
    })

    await t.test('Windows casing variants compare as the same path', () => {
      assert.equal(
        pathsEqual(
          'C:\\Users\\Pascal\\PosterValley',
          'c:\\users\\pascal\\postervalley',
          'win32',
        ),
        true,
      )
      if (process.platform === 'win32') {
        const result = runPreflight({
          branch: 'codex/no-upstream',
          commonDirectory: commonDirectory.toUpperCase(),
          expectedHead: baselineHead,
          expectedRoot: active.toUpperCase(),
          remote,
          root: active,
        })
        assert.equal(result.status, 0, result.stderr)
      }
    })
  } finally {
    rmSync(fixtureRoot, { force: true, recursive: true })
  }
})
