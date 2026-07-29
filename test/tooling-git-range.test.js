import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import {
  appendFileSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { checkGitRange } from '../scripts/tooling/git-diff-check.mjs'

function git(cwd, ...args) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
}

test('Git range checks inspect real commits and fail closed on unavailable history', async (t) => {
  const fixtureRoot = mkdtempSync(path.join(tmpdir(), 'pv-git-range-'))
  const repository = path.join(fixtureRoot, 'repository')
  const shallow = path.join(fixtureRoot, 'shallow')
  try {
    execFileSync('git', ['init', '--initial-branch=main', repository])
    git(repository, 'config', 'user.email', 'tooling@example.test')
    git(repository, 'config', 'user.name', 'Tooling Fixture')
    const file = path.join(repository, 'fixture.txt')

    writeFileSync(file, 'baseline\n')
    git(repository, 'add', 'fixture.txt')
    git(repository, 'commit', '-m', 'baseline')
    const base = git(repository, 'rev-parse', 'HEAD')

    appendFileSync(file, 'clean change\n')
    git(repository, 'add', 'fixture.txt')
    git(repository, 'commit', '-m', 'clean change')
    const cleanHead = git(repository, 'rev-parse', 'HEAD')

    await t.test('clean commit succeeds', () => {
      const result = checkGitRange({
        base,
        cwd: repository,
        head: cleanHead,
      })
      assert.equal(result.commits.length, 1)
    })

    appendFileSync(file, 'bad trailing whitespace   \n')
    git(repository, 'add', 'fixture.txt')
    git(repository, 'commit', '-m', 'bad whitespace')
    const badHead = git(repository, 'rev-parse', 'HEAD')

    await t.test('commit with trailing whitespace fails', () => {
      assert.throws(
        () => checkGitRange({ base: cleanHead, cwd: repository, head: badHead }),
        /whitespace check/i,
      )
    })

    writeFileSync(file, 'baseline\nclean change\nclean again\n')
    git(repository, 'add', 'fixture.txt')
    git(repository, 'commit', '-m', 'clean final state')
    const multiHead = git(repository, 'rev-parse', 'HEAD')

    await t.test('multiple-commit range still detects an earlier bad commit', () => {
      assert.throws(
        () => checkGitRange({ base, cwd: repository, head: multiHead }),
        /whitespace check/i,
      )
    })

    await t.test('missing base ref fails clearly', () => {
      assert.throws(
        () =>
          checkGitRange({
            base: 'refs/heads/not-present',
            cwd: repository,
            head: multiHead,
          }),
        /unavailable.*Fetch sufficient history/i,
      )
    })

    await t.test('shallow history stops fail-closed when base is absent', () => {
      execFileSync('git', [
        'clone',
        '--depth=1',
        `file://${repository.replaceAll('\\', '/')}`,
        shallow,
      ])
      assert.throws(
        () => checkGitRange({ base, cwd: shallow, head: 'HEAD' }),
        /unavailable.*Fetch sufficient history/i,
      )
    })
  } finally {
    rmSync(fixtureRoot, { force: true, recursive: true })
  }
})
