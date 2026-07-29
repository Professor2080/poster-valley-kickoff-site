import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { repositoryRoot, scanTextForSecrets } from './repository-checks.mjs'

const allowedScopes = new Set(['repository', 'personal', 'workspace', 'plugin'])
const allowedStatuses = new Set(['draft', 'active', 'deprecated', 'archived'])
const materializedRepositoryStatuses = new Set([
  'draft',
  'active',
  'deprecated',
])
const allowedForwardOutcomes = new Set([
  'invoke',
  'do-not-invoke',
  'stop-no-authorization',
  'not-verified',
])
const expectedForwardTests = new Map([
  [
    'preflight-identity',
    ['poster-valley-preflight', 'invoke'],
  ],
  [
    'safe-change-write',
    ['poster-valley-safe-change', 'invoke'],
  ],
  [
    'safe-change-read-only-non-trigger',
    [null, 'do-not-invoke'],
  ],
  [
    'release-readiness',
    ['poster-valley-release-gate', 'invoke'],
  ],
  [
    'release-write-stop',
    ['poster-valley-release-gate', 'stop-no-authorization'],
  ],
  [
    'database-write-stop',
    ['poster-valley-release-gate', 'stop-no-authorization'],
  ],
  [
    'missing-remote-access',
    ['poster-valley-release-gate', 'not-verified'],
  ],
])
const requiredGates = [
  'commit',
  'push',
  'merge',
  'deploy',
  'database',
  'email',
  'payment',
  'external settings',
]
const requiredTemplateHeadings = [
  '## Goal',
  '## When to use',
  '## When not to use',
  '## Required context',
  '## Required tools',
  '## Steps',
  '## Safety boundaries',
  '## Allowed actions',
  '## Human approval',
  '## Stop conditions',
  '## Verification',
  '## Expected output',
  '## Synthetic examples',
  '## Version and changelog',
]

export function readSkillRegister(text) {
  const section = text.match(
    /## Machine-readable register[\s\S]*?```json\s*([\s\S]*?)```/,
  )
  if (!section) {
    throw new Error('docs/skills/README.md has no machine-readable JSON register.')
  }
  return JSON.parse(section[1])
}

function skillDirectories(root) {
  const directory = path.join(root, '.agents', 'skills')
  return readdirSync(directory)
    .filter((entry) => {
      const skillPath = path.join(directory, entry)
      return (
        statSync(skillPath).isDirectory() &&
        statSync(path.join(skillPath, 'SKILL.md')).isFile()
      )
    })
    .sort()
}

function parseSkillFrontmatter(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/)
  if (!match) throw new Error('missing YAML frontmatter')
  const values = {}
  const keys = []
  for (const line of match[1].split(/\r?\n/)) {
    const separator = line.indexOf(':')
    if (separator === -1) throw new Error(`invalid frontmatter line '${line}'`)
    const key = line.slice(0, separator).trim()
    values[key] = line.slice(separator + 1).trim()
    keys.push(key)
  }
  if (
    keys.length !== 2 ||
    !keys.includes('name') ||
    !keys.includes('description')
  ) {
    throw new Error('frontmatter must contain only name and description')
  }
  if (!/^[a-z0-9-]{1,63}$/.test(values.name)) {
    throw new Error(`invalid skill name '${values.name}'`)
  }
  if (!values.description) throw new Error('description is empty')
  return values
}

function validateOpenAiYaml(root, skillName, status, issues) {
  const file = path.join(
    root,
    '.agents',
    'skills',
    skillName,
    'agents',
    'openai.yaml',
  )
  let text
  try {
    text = readFileSync(file, 'utf8')
  } catch {
    issues.push(`${skillName}: agents/openai.yaml is missing`)
    return
  }
  for (const field of [
    'interface:',
    'display_name:',
    'short_description:',
    'default_prompt:',
    'policy:',
    'allow_implicit_invocation:',
  ]) {
    if (!text.includes(field)) {
      issues.push(`${skillName}: agents/openai.yaml lacks ${field}`)
    }
  }
  const shortDescription = text.match(/short_description:\s*"([^"]+)"/)?.[1]
  if (
    !shortDescription ||
    shortDescription.length < 25 ||
    shortDescription.length > 64
  ) {
    issues.push(
      `${skillName}: short_description must contain 25-64 characters`,
    )
  }
  const defaultPrompt = text.match(/default_prompt:\s*"([^"]+)"/)?.[1]
  if (!defaultPrompt?.includes(`$${skillName}`)) {
    issues.push(`${skillName}: default_prompt must mention $${skillName}`)
  }
  const implicitValue = text.match(
    /allow_implicit_invocation:\s*(true|false)/,
  )?.[1]
  const expectedImplicitValue = status === 'active' ? 'true' : 'false'
  if (implicitValue !== expectedImplicitValue) {
    issues.push(
      `${skillName}: allow_implicit_invocation must be ${expectedImplicitValue} while status is ${status}`,
    )
  }
}

export function validateRegisterStructure(register, directories = []) {
  const issues = []
  if (register.schemaVersion !== 1 || !Array.isArray(register.skills)) {
    return ['skill register: unsupported schema']
  }

  const registeredNames = register.skills.map((skill) => skill.officialName)
  if (new Set(registeredNames).size !== registeredNames.length) {
    issues.push('skill register: official names must be unique')
  }

  for (const directory of directories) {
    const registration = register.skills.find(
      (skill) => skill.officialName === directory,
    )
    if (!registration) {
      issues.push(`${directory}: repository skill is not registered`)
    } else if (
      registration.scope !== 'repository' ||
      registration.status === 'archived'
    ) {
      issues.push(
        `${directory}: local skill folder requires repository scope and a materialized status`,
      )
    }
  }

  for (const skill of register.skills) {
    const label = skill.officialName || '(unnamed skill)'
    if (!allowedScopes.has(skill.scope)) {
      issues.push(`${label}: invalid scope '${skill.scope}'`)
    }
    if (!allowedStatuses.has(skill.status)) {
      issues.push(`${label}: invalid status '${skill.status}'`)
    }
    if (!/^\d+\.\d+\.\d+$/.test(skill.version || '')) {
      issues.push(`${label}: invalid semantic version`)
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(skill.lastReviewed || '')) {
      issues.push(`${label}: missing or invalid lastReviewed date`)
    }
    for (const field of [
      'description',
      'trigger',
      'nonTrigger',
      'pathOrSource',
      'owner',
    ]) {
      if (!skill[field]) issues.push(`${label}: ${field} is required`)
    }
    for (const field of [
      'requiredTools',
      'requiredAppsOrMcp',
      'requiredPermissions',
      'readCapabilities',
      'writeCapabilities',
      'humanApprovalGates',
      'regressionTests',
    ]) {
      if (!Array.isArray(skill[field])) {
        issues.push(`${label}: ${field} must be an array`)
      }
    }
    const gates = (skill.humanApprovalGates || []).join(' ').toLowerCase()
    for (const gate of requiredGates) {
      if (!gates.includes(gate)) {
        issues.push(`${label}: missing human approval gate '${gate}'`)
      }
    }
    if (skill.status === 'deprecated' && !skill.replacement) {
      issues.push(`${label}: deprecated skill must name a replacement`)
    }

    const hasDirectory = directories.includes(skill.officialName)
    const requiresDirectory =
      skill.scope === 'repository' &&
      materializedRepositoryStatuses.has(skill.status)
    if (requiresDirectory && !hasDirectory) {
      issues.push(`${label}: materialized repository skill folder is missing`)
    }
    if (
      hasDirectory &&
      (skill.scope !== 'repository' || skill.status === 'archived')
    ) {
      issues.push(
        `${label}: external or archived skill must not retain a local executable folder`,
      )
    }
  }

  if (!Array.isArray(register.forwardTests)) {
    issues.push('skill register: forwardTests must be an array')
    return issues
  }
  const forwardIds = register.forwardTests.map((fixture) => fixture.id)
  if (new Set(forwardIds).size !== forwardIds.length) {
    issues.push('skill register: forward test ids must be unique')
  }
  for (const [id, [expectedSkill, expectedOutcome]] of expectedForwardTests) {
    const fixture = register.forwardTests.find((candidate) => candidate.id === id)
    if (!fixture) {
      issues.push(`skill register: missing forward test '${id}'`)
      continue
    }
    if (!fixture.prompt) {
      issues.push(`skill register: forward test '${id}' has no prompt`)
    }
    if (
      fixture.expectedSkill !== null &&
      !registeredNames.includes(fixture.expectedSkill)
    ) {
      issues.push(
        `skill register: forward test '${id}' names an unregistered skill`,
      )
    }
    if (!allowedForwardOutcomes.has(fixture.expectedOutcome)) {
      issues.push(
        `skill register: forward test '${id}' has an invalid outcome`,
      )
    }
    if (
      fixture.expectedSkill !== expectedSkill ||
      fixture.expectedOutcome !== expectedOutcome
    ) {
      issues.push(`skill register: forward test '${id}' changed its contract`)
    }
    for (const issue of scanTextForSecrets(
      'docs/skills/forward-tests.json',
      fixture.prompt || '',
    )) {
      issues.push(`skill register: forward test '${id}': ${issue}`)
    }
  }
  for (const id of forwardIds) {
    if (!expectedForwardTests.has(id)) {
      issues.push(`skill register: unreviewed forward test '${id}'`)
    }
  }
  return issues
}

function validateMarkdownLinks(root, files, issues) {
  for (const file of files) {
    const absolute = path.join(root, file)
    const text = readFileSync(absolute, 'utf8')
    for (const match of text.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
      const target = match[1]
      if (
        target.startsWith('#') ||
        /^[a-z]+:/i.test(target) ||
        target.includes('<')
      ) {
        continue
      }
      const fileTarget = target.split('#')[0]
      if (!fileTarget) continue
      const resolved = path.resolve(path.dirname(absolute), fileTarget)
      try {
        statSync(resolved)
      } catch {
        issues.push(`${file}: broken relative link '${target}'`)
      }
    }
  }
}

function validateMcpDocumentation(root, issues) {
  const file = path.join(root, 'docs', 'environment-matrix.md')
  const text = readFileSync(file, 'utf8')
  const block = text.match(
    /## Future read-only Supabase Staging MCP[\s\S]*?```toml\s*([\s\S]*?)```/,
  )?.[1]
  if (!block) {
    issues.push('environment-matrix: active Staging MCP TOML block is missing')
    return
  }
  if (!block.includes('project_ref=cdmocdodehjmcgtxicaj')) {
    issues.push('environment-matrix: Staging project ref is missing from MCP URL')
  }
  if (!block.includes('read_only=true')) {
    issues.push('environment-matrix: MCP URL does not require read_only=true')
  }
  if (block.includes('epqpeoubkbftcvxjbqeo')) {
    issues.push('environment-matrix: Production ref appears in active MCP config')
  }
  if (
    /\b(?:execute_sql|apply_migration|create_branch|delete_branch|insert|update|delete)\b/i.test(
      block,
    )
  ) {
    issues.push('environment-matrix: MCP allowlist contains a write-capable tool')
  }
  for (const command of [
    'codex mcp list',
    'codex mcp get supabase_staging',
    'codex mcp logout supabase_staging',
    'codex mcp remove supabase_staging',
  ]) {
    if (!text.includes(command)) {
      issues.push(`environment-matrix: missing documented command '${command}'`)
    }
  }
}

export function checkGovernance(root = repositoryRoot()) {
  const issues = []
  const registerPath = path.join(root, 'docs', 'skills', 'README.md')
  const templatePath = path.join(root, 'docs', 'skills', 'SKILL_TEMPLATE.md')
  const register = readSkillRegister(readFileSync(registerPath, 'utf8'))
  const directories = skillDirectories(root)
  issues.push(...validateRegisterStructure(register, directories))
  if (register.schemaVersion !== 1 || !Array.isArray(register.skills)) {
    return issues
  }

  for (const skill of register.skills) {
    const label = skill.officialName || '(unnamed skill)'
    if (
      skill.scope !== 'repository' ||
      !materializedRepositoryStatuses.has(skill.status) ||
      !directories.includes(skill.officialName)
    ) {
      continue
    }
    const skillPath = path.join(
      root,
      '.agents',
      'skills',
      skill.officialName,
      'SKILL.md',
    )
    try {
      const frontmatter = parseSkillFrontmatter(readFileSync(skillPath, 'utf8'))
      if (frontmatter.name !== skill.officialName) {
        issues.push(`${label}: folder/register/frontmatter name mismatch`)
      }
    } catch (error) {
      issues.push(`${label}: ${error.message}`)
    }
    validateOpenAiYaml(root, skill.officialName, skill.status, issues)
  }

  const template = readFileSync(templatePath, 'utf8')
  for (const heading of requiredTemplateHeadings) {
    if (!template.includes(heading)) {
      issues.push(`skill template: missing '${heading}'`)
    }
  }
  for (const issue of scanTextForSecrets(
    'docs/skills/SKILL_TEMPLATE.md',
    template,
  )) {
    issues.push(`skill template synthetic-example check: ${issue}`)
  }

  validateMcpDocumentation(root, issues)
  validateMarkdownLinks(
    root,
    [
      'AGENTS.md',
      'README.md',
      'docs/development-workflow.md',
      'docs/environment-matrix.md',
      'docs/release-runbook.md',
      'docs/worktree-and-branch-policy.md',
      'docs/skills/README.md',
    ],
    issues,
  )
  return issues
}

export function run(root = repositoryRoot()) {
  const issues = checkGovernance(root)
  if (issues.length) {
    issues.forEach((issue) => console.error(`FAIL ${issue}`))
    return false
  }
  console.log(
    'PASS skill register, template, metadata, links, and Staging MCP documentation.',
  )
  return true
}

const isMain =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href ===
    pathToFileURL(fileURLToPath(import.meta.url)).href

if (isMain) {
  try {
    if (!run()) process.exitCode = 1
  } catch (error) {
    console.error(`FAIL governance checks: ${error.message}`)
    process.exitCode = 1
  }
}
