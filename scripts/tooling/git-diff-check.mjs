import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

function git(args, cwd, { allowFailure = false } = {}) {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim()
  } catch (error) {
    const detail = String(error.stdout || error.stderr || error.message).trim()
    if (allowFailure) {
      return { detail, failed: true }
    }
    throw new Error(
      `git ${args.join(' ')} failed${detail ? `:\n${detail}` : ''}`,
    )
  }
}

function assertCommit(ref, cwd, label) {
  const resolved = git(['rev-parse', '--verify', `${ref}^{commit}`], cwd, {
    allowFailure: true,
  })
  if (typeof resolved === 'object' && resolved.failed) {
    throw new Error(
      `${label} '${ref}' is unavailable. Fetch sufficient history before running the range check.`,
    )
  }
  return resolved
}

function checkCommand(args, cwd, label) {
  const result = git(args, cwd, { allowFailure: true })
  if (typeof result === 'object' && result.failed) {
    throw new Error(`${label} failed${result.detail ? `:\n${result.detail}` : '.'}`)
  }
}

export function checkLocalDiff(cwd = process.cwd()) {
  checkCommand(['diff', '--check'], cwd, 'Unstaged whitespace check')
  checkCommand(['diff', '--cached', '--check'], cwd, 'Staged whitespace check')
  return true
}

export function checkGitRange({ base, cwd = process.cwd(), head }) {
  const baseCommit = assertCommit(base, cwd, 'Base commit')
  const headCommit = assertCommit(head, cwd, 'Head commit')
  const mergeBase = git(['merge-base', baseCommit, headCommit], cwd, {
    allowFailure: true,
  })
  if (typeof mergeBase === 'object' && mergeBase.failed) {
    throw new Error(
      `No merge base is available for '${baseCommit}' and '${headCommit}'.`,
    )
  }

  const commits = git(
    ['rev-list', '--reverse', `${mergeBase}..${headCommit}`],
    cwd,
  )
    .split(/\r?\n/)
    .filter(Boolean)
  for (const commit of commits) {
    checkCommand(
      ['show', '--check', '--format=', '--no-renames', commit],
      cwd,
      `Whitespace check for commit ${commit}`,
    )
  }
  checkCommand(
    ['diff', '--check', `${mergeBase}...${headCommit}`],
    cwd,
    `Final range whitespace check ${mergeBase}...${headCommit}`,
  )
  return { base: baseCommit, commits, head: headCommit, mergeBase }
}

function argumentValue(name) {
  const index = process.argv.indexOf(name)
  return index === -1 ? null : process.argv[index + 1]
}

export function run() {
  if (process.argv.includes('--local')) {
    checkLocalDiff()
    console.log('PASS unstaged and staged local Git whitespace checks.')
    return true
  }
  const base = argumentValue('--base')
  const head = argumentValue('--head')
  if (!base || !head) {
    throw new Error('Range mode requires --base <commit> and --head <commit>.')
  }
  const result = checkGitRange({ base, head })
  console.log(
    `PASS Git range whitespace checks (${result.commits.length} commit(s), ${result.mergeBase}...${result.head}).`,
  )
  return true
}

const isMain =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href ===
    pathToFileURL(fileURLToPath(import.meta.url)).href

if (isMain) {
  try {
    run()
  } catch (error) {
    console.error(`FAIL Git diff check: ${error.message}`)
    process.exitCode = 1
  }
}
