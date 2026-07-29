import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const OFFICIAL_REMOTE =
  'https://github.com/Professor2080/poster-valley-kickoff-site.git'
const OFFICIAL_PACKAGE = 'poster-valley-kickoff-site'
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const defaultPolicyFile = path.join(scriptDirectory, 'worktree-policy.json')

function git(
  args,
  cwd,
  { allowFailure = false, preserveLeadingWhitespace = false } = {},
) {
  try {
    const output = execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return preserveLeadingWhitespace
      ? output.replace(/\r?\n$/, '')
      : output.trim()
  } catch (error) {
    if (allowFailure) {
      return null
    }
    const detail = String(error.stderr || error.stdout || error.message).trim()
    throw new Error(
      `git ${args.join(' ')} failed${detail ? `: ${detail}` : ''}`,
    )
  }
}

export function normalizeComparablePath(value, platform = process.platform) {
  const pathApi = platform === 'win32' ? path.win32 : path
  let normalized = pathApi.resolve(value).replace(/[\\/]+$/, '')
  if (platform === 'win32') {
    normalized = normalized.replaceAll('/', '\\').toLowerCase()
  }
  return normalized
}

export function pathsEqual(left, right, platform = process.platform) {
  return (
    normalizeComparablePath(left, platform) ===
    normalizeComparablePath(right, platform)
  )
}

function canonicalExistingPath(value, label) {
  if (!path.isAbsolute(value)) {
    throw new Error(`${label} must be an absolute path.`)
  }
  if (!existsSync(value)) {
    throw new Error(`${label} does not exist: ${value}`)
  }
  return realpathSync.native(value)
}

function assertUnaliasedPath(value, label) {
  const canonical = canonicalExistingPath(value, label)
  if (!pathsEqual(value, canonical)) {
    throw new Error(
      `${label} resolves through a symlink, junction, or alternate path. ` +
        `Use the canonical path '${canonical}'.`,
    )
  }
  return canonical
}

function normalizeRemote(value) {
  return value
    .trim()
    .replaceAll('\\', '/')
    .replace(/\.git$/i, '')
    .replace(/\/+$/, '')
    .toLowerCase()
}

function parseWorktrees(text) {
  const records = []
  let record = null

  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith('worktree ')) {
      if (record) records.push(record)
      record = { path: line.slice('worktree '.length) }
    } else if (record && line.startsWith('HEAD ')) {
      record.head = line.slice('HEAD '.length)
    } else if (record && line.startsWith('branch ')) {
      record.branch = line.slice('branch refs/heads/'.length)
    } else if (record && line === 'detached') {
      record.detached = true
    }
  }
  if (record) records.push(record)
  return records
}

function findAncestorRepositories(root) {
  const repositories = []
  let current = path.dirname(root)
  while (current !== path.dirname(current)) {
    if (existsSync(path.join(current, '.git'))) {
      repositories.push(current)
    }
    current = path.dirname(current)
  }
  return repositories
}

export function classifyWorktreeRole(branch, policy) {
  if (policy.referenceBranches.includes(branch)) {
    return 'reference'
  }
  if (
    policy.archiveBranches.includes(branch) ||
    policy.archiveBranchPatterns.some((pattern) =>
      new RegExp(pattern).test(branch),
    )
  ) {
    return 'archive'
  }
  if (new RegExp(policy.activeBranchPattern).test(branch)) {
    return 'active'
  }
  return 'unknown'
}

function parseArguments(argv) {
  const options = {
    continueExistingChanges: false,
    expectedRemote: OFFICIAL_REMOTE,
    mode: 'change',
    policyFile: defaultPolicyFile,
    skipRemoteLookup: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--continue-existing-changes') {
      options.continueExistingChanges = true
      continue
    }
    if (argument === '--skip-remote-lookup') {
      options.skipRemoteLookup = true
      continue
    }
    if (!argument.startsWith('--')) {
      throw new Error(`Unexpected argument '${argument}'.`)
    }
    const key = argument
      .slice(2)
      .replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for ${argument}.`)
    }
    options[key] = value
    index += 1
  }
  return options
}

function requireOption(options, name) {
  if (!options[name]) {
    throw new Error(`Missing required option --${name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}.`)
  }
}

export function inspectPreflight(options, cwd = process.cwd()) {
  if (
    (normalizeRemote(options.expectedRemote) !==
      normalizeRemote(OFFICIAL_REMOTE) ||
      path.resolve(options.policyFile) !== path.resolve(defaultPolicyFile)) &&
    process.env.POSTER_VALLEY_PREFLIGHT_TEST !== '1'
  ) {
    throw new Error(
      'Repository identity and role-policy overrides are allowed only in synthetic preflight tests.',
    )
  }
  for (const required of [
    'role',
    'expectedRoot',
    'expectedCommonDirectory',
    'expectedBranch',
  ]) {
    requireOption(options, required)
  }
  if (!['active', 'archive', 'reference'].includes(options.role)) {
    throw new Error(`Unknown worktree role '${options.role}'.`)
  }
  if (!['change', 'inspect'].includes(options.mode)) {
    throw new Error(`Unknown preflight mode '${options.mode}'.`)
  }
  if (options.mode === 'change' && options.role !== 'active') {
    throw new Error(
      `Worktree role '${options.role}' is read-only and cannot be used for a change task.`,
    )
  }
  if (
    options.continueExistingChanges &&
    (options.mode !== 'change' || options.role !== 'active')
  ) {
    throw new Error(
      '--continue-existing-changes is valid only for an active change task.',
    )
  }

  const rawRoot = git(['rev-parse', '--show-toplevel'], cwd)
  const root = assertUnaliasedPath(rawRoot, 'Repository root')
  const expectedRoot = assertUnaliasedPath(
    options.expectedRoot,
    'Expected repository root',
  )
  if (!pathsEqual(root, expectedRoot)) {
    throw new Error(
      `Worktree identity failed: expected '${expectedRoot}', found '${root}'.`,
    )
  }

  const rawCommonDirectory = git(
    ['rev-parse', '--path-format=absolute', '--git-common-dir'],
    root,
  )
  const commonDirectory = assertUnaliasedPath(
    rawCommonDirectory,
    'Git common directory',
  )
  const expectedCommonDirectory = assertUnaliasedPath(
    options.expectedCommonDirectory,
    'Expected Git common directory',
  )
  if (!pathsEqual(commonDirectory, expectedCommonDirectory)) {
    throw new Error(
      `Git common-directory identity failed: expected '${expectedCommonDirectory}', found '${commonDirectory}'.`,
    )
  }

  const branch = git(['symbolic-ref', '--quiet', '--short', 'HEAD'], root, {
    allowFailure: true,
  })
  if (!branch) {
    throw new Error('Detached HEAD is not allowed.')
  }
  if (branch !== options.expectedBranch) {
    throw new Error(
      `Branch check failed: expected '${options.expectedBranch}', found '${branch}'.`,
    )
  }

  const policy = JSON.parse(readFileSync(options.policyFile, 'utf8'))
  const actualRole = classifyWorktreeRole(branch, policy)
  if (actualRole !== options.role) {
    throw new Error(
      `Worktree role failed: expected '${options.role}', branch '${branch}' is classified as '${actualRole}'.`,
    )
  }
  if (options.role === 'active' && branch === 'main') {
    throw new Error('main is never an active change branch.')
  }

  const head = git(['rev-parse', 'HEAD'], root)
  if (options.expectedHead && head !== options.expectedHead) {
    throw new Error(
      `HEAD check failed: expected '${options.expectedHead}', found '${head}'.`,
    )
  }

  const worktrees = parseWorktrees(
    git(['worktree', 'list', '--porcelain'], root),
  )
  const currentRecords = worktrees.filter((record) => {
    if (!existsSync(record.path)) return false
    return pathsEqual(realpathSync.native(record.path), root)
  })
  if (currentRecords.length !== 1) {
    throw new Error(
      `Worktree registration is ambiguous: expected one canonical record for '${root}', found ${currentRecords.length}.`,
    )
  }
  const currentRecord = currentRecords[0]
  if (
    currentRecord.head !== head ||
    currentRecord.branch !== branch ||
    currentRecord.detached
  ) {
    throw new Error('Worktree registration does not match the current branch and HEAD.')
  }

  const packagePath = path.join(root, 'package.json')
  if (!existsSync(packagePath)) {
    throw new Error(`Repository identity failed: package.json is missing at ${root}.`)
  }
  const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'))
  if (packageJson.name !== OFFICIAL_PACKAGE) {
    throw new Error(
      `Repository identity failed: expected package '${OFFICIAL_PACKAGE}', found '${packageJson.name}'.`,
    )
  }

  const remote = git(['remote', 'get-url', 'origin'], root)
  if (normalizeRemote(remote) !== normalizeRemote(options.expectedRemote)) {
    throw new Error(
      `Repository identity failed: expected origin '${options.expectedRemote}', found '${remote}'.`,
    )
  }
  const originMain = git(['rev-parse', 'origin/main'], root)
  let remoteMain = null
  if (!options.skipRemoteLookup) {
    const remoteLines = git(
      ['ls-remote', '--heads', 'origin', 'refs/heads/main'],
      root,
    )
      .split(/\r?\n/)
      .filter(Boolean)
    if (remoteLines.length !== 1) {
      throw new Error(
        'Unable to identify exactly one remote main tip. Use --skip-remote-lookup only for an explicitly offline inspection.',
      )
    }
    remoteMain = remoteLines[0].split(/\s+/)[0]
    if (remoteMain !== originMain) {
      throw new Error(
        `Remote identity failed: origin/main is ${originMain} but remote main is ${remoteMain}.`,
      )
    }
  }

  const upstream = git(
    ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'],
    root,
    { allowFailure: true },
  )
  if (options.role === 'active') {
    const allowedUpstream = `origin/${branch}`
    if (upstream && upstream !== allowedUpstream) {
      throw new Error(
        `Upstream check failed: active branch '${branch}' may track only '${allowedUpstream}', found '${upstream}'.`,
      )
    }
  }

  const status = git(
    ['status', '--porcelain=v1', '--untracked-files=all'],
    root,
    { preserveLeadingWhitespace: true },
  )
    .split(/\r?\n/)
    .filter(Boolean)
  if (
    status.length > 0 &&
    options.mode === 'change' &&
    !options.continueExistingChanges
  ) {
    throw new Error(
      'Working tree is not clean. Use --continue-existing-changes only when the task explicitly continues these existing changes.',
    )
  }

  return {
    actualRole,
    ancestorRepositories: findAncestorRepositories(root),
    branch,
    commonDirectory,
    head,
    mode: options.mode,
    originMain,
    remote,
    remoteMain,
    root,
    status,
    upstream,
    worktrees,
  }
}

export function formatPreflight(result) {
  const lines = [
    'Poster Valley preflight',
    `  Root:             ${result.root}`,
    `  Git common dir:   ${result.commonDirectory}`,
    `  Role/mode:        ${result.actualRole}/${result.mode}`,
    `  Origin:           ${result.remote}`,
    `  Branch:           ${result.branch}`,
    `  Upstream:         ${result.upstream || 'none'}`,
    `  HEAD:             ${result.head}`,
    `  origin/main:      ${result.originMain}`,
  ]
  if (result.remoteMain) {
    lines.push(`  remote main:      ${result.remoteMain}`)
  }
  lines.push(
    `  Working tree:     ${
      result.status.length === 0
        ? 'clean'
        : result.mode === 'inspect'
          ? `dirty (${result.status.length} entries; read-only inspection)`
          : `dirty (${result.status.length} entries; explicitly continued)`
    }`,
    `  Parent repos:     ${
      result.ancestorRepositories.length
        ? result.ancestorRepositories.join(', ')
        : 'none'
    }`,
    '  Worktrees:',
    ...result.worktrees.map(
      (worktree) =>
        `    ${worktree.path} ${worktree.head || ''} ${worktree.branch || '(detached)'}`,
    ),
  )
  if (result.status.length) {
    lines.push(
      '  Status paths (no contents or values):',
      ...result.status.map((entry) => `    ${entry}`),
    )
  }
  lines.push('PASS repository identity and preflight checks.')
  return lines.join('\n')
}

export function run(argv = process.argv.slice(2), cwd = process.cwd()) {
  const options = parseArguments(argv)
  const result = inspectPreflight(options, cwd)
  console.log(formatPreflight(result))
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
    console.error(`FAIL Poster Valley preflight: ${error.message}`)
    process.exitCode = 1
  }
}
