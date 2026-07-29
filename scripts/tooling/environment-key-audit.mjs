import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const allEnvironments = [
  'development',
  'preview',
  'staging',
  'production',
]
const allRemoteEnvironments = ['preview', 'staging', 'production']
const previewAndStaging = ['preview', 'staging']

function policy(exposure, allowedIn, requiredIn = []) {
  return { allowedIn, exposure, requiredIn }
}

export const environmentPolicy = {
  VITE_SUPABASE_URL: policy(
    'browser-safe',
    allEnvironments,
    allRemoteEnvironments,
  ),
  VITE_SUPABASE_PUBLISHABLE_KEY: policy(
    'browser-safe',
    allEnvironments,
    allRemoteEnvironments,
  ),
  SUPABASE_URL: policy(
    'server-only',
    allEnvironments,
    allRemoteEnvironments,
  ),
  SUPABASE_SERVICE_ROLE_KEY: policy(
    'server-only',
    allEnvironments,
    allRemoteEnvironments,
  ),
  RESEND_API_KEY: policy('server-only', ['production'], ['production']),
  VERSEL_RESEND_API_KEY: policy('server-only', ['production']),
  FORM_NOTIFICATION_TO: policy('server-only', allRemoteEnvironments),
  FORM_NOTIFICATION_FROM: policy('server-only', allRemoteEnvironments),
  FORM_NOTIFICATION_REPLY_TO: policy('server-only', allRemoteEnvironments),
  SITE_URL: policy('server-only', allEnvironments, allRemoteEnvironments),
  ADMIN_ACTION_SECRET: policy(
    'server-only',
    allRemoteEnvironments,
    allRemoteEnvironments,
  ),
  POSTER_VALLEY_ENV: policy(
    'server-only',
    allEnvironments,
    allRemoteEnvironments,
  ),
  OPERATIONAL_EMAIL_DELIVERY_ENABLED: policy(
    'server-only',
    ['production'],
    ['production'],
  ),
  OPERATIONAL_EMAIL_FROM: policy(
    'server-only',
    ['production'],
    ['production'],
  ),
  OPERATIONAL_EMAIL_REPLY_TO: policy(
    'server-only',
    ['production'],
    ['production'],
  ),
  ADMIN_INVITATION_TOKEN_SECRET: policy(
    'server-only',
    allRemoteEnvironments,
    allRemoteEnvironments,
  ),
  ADMIN_CONFIRMATION_SECRET: policy(
    'server-only',
    allRemoteEnvironments,
    allRemoteEnvironments,
  ),
  MOLLIE_API_KEY: policy(
    'server-only',
    [...previewAndStaging, 'production'],
    ['production'],
  ),
  MOLLIE_TEST_MODE: policy(
    'server-only',
    allEnvironments,
  ),
}

export function parseEnvironmentNames(text) {
  const names = new Set()
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const match = line.match(
      /^(?:export\s+)?([A-Z][A-Z0-9_]*)\s*(?:=.*)?$/,
    )
    if (match) names.add(match[1])
  }
  return [...names].sort()
}

export function readEnvironmentNames(file) {
  return parseEnvironmentNames(readFileSync(file, 'utf8'))
}

export function auditEnvironmentNames({
  exampleNames,
  suppliedNames = null,
  environment = null,
}) {
  const policyNames = Object.keys(environmentPolicy).sort()
  const missingPolicy = exampleNames.filter((name) => !environmentPolicy[name])
  const stalePolicy = policyNames.filter((name) => !exampleNames.includes(name))
  const requiredNames = environment
    ? exampleNames.filter((name) =>
        environmentPolicy[name]?.requiredIn.includes(environment),
      )
    : exampleNames

  if (!suppliedNames) {
    return {
      browserSecrets: [],
      disallowed: [],
      missing: [],
      missingPolicy,
      requiredNames,
      stalePolicy,
      unexpected: [],
    }
  }

  return {
    browserSecrets: suppliedNames.filter(
      (name) =>
        name.startsWith('VITE_') &&
        environmentPolicy[name]?.exposure !== 'browser-safe',
    ),
    disallowed: environment
      ? suppliedNames.filter(
          (name) =>
            environmentPolicy[name] &&
            !environmentPolicy[name].allowedIn.includes(environment),
        )
      : [],
    missing: requiredNames.filter((name) => !suppliedNames.includes(name)),
    missingPolicy,
    requiredNames,
    stalePolicy,
    unexpected: suppliedNames.filter((name) => !exampleNames.includes(name)),
  }
}

function argumentValue(name) {
  const index = process.argv.indexOf(name)
  return index === -1 ? null : process.argv[index + 1]
}

export function evaluateAudit(result, { allowMissing = false } = {}) {
  return [
    ...result.missingPolicy.map((name) => `missing policy for ${name}`),
    ...result.stalePolicy.map((name) => `stale policy for ${name}`),
    ...result.unexpected.map((name) => `unexpected name ${name}`),
    ...result.disallowed.map((name) => `disallowed name ${name}`),
    ...result.browserSecrets.map(
      (name) => `browser-prefixed secret or unclassified name ${name}`,
    ),
    ...(allowMissing
      ? []
      : result.missing.map((name) => `missing required name ${name}`)),
  ]
}

export function run() {
  const root = process.cwd()
  const exampleFile = path.join(root, '.env.example')
  const namesFile = argumentValue('--names-file')
  const environment = argumentValue('--environment')
  const allowMissing = process.argv.includes('--allow-missing')

  if (environment && !allEnvironments.includes(environment)) {
    throw new Error(`Unknown environment '${environment}'.`)
  }
  if (allowMissing && !namesFile) {
    throw new Error('--allow-missing is valid only with --names-file.')
  }

  const exampleNames = readEnvironmentNames(exampleFile)
  const suppliedNames = namesFile
    ? readEnvironmentNames(path.resolve(root, namesFile))
    : null
  const result = auditEnvironmentNames({
    environment,
    exampleNames,
    suppliedNames,
  })

  console.log('Environment key policy (names only; values are never printed)')
  for (const exposure of ['browser-safe', 'server-only']) {
    console.log(`  ${exposure}:`)
    for (const name of exampleNames.filter(
      (key) => environmentPolicy[key]?.exposure === exposure,
    )) {
      const settings = environmentPolicy[name]
      console.log(
        `    ${name}: allowed=${settings.allowedIn.join(', ')}; required=${settings.requiredIn.join(', ') || 'none'}`,
      )
    }
  }

  if (namesFile) {
    console.log(`  Compared names file: ${namesFile}`)
    console.log(`  Environment: ${environment ?? 'all'}`)
    console.log(`  Supplied names: ${suppliedNames.length}`)
    console.log(`  Required names: ${result.requiredNames.join(', ') || 'none'}`)
    console.log(`  Missing names: ${result.missing.join(', ') || 'none'}`)
    console.log(`  Unexpected names: ${result.unexpected.join(', ') || 'none'}`)
    console.log(`  Disallowed names: ${result.disallowed.join(', ') || 'none'}`)
    console.log(
      `  Browser-secret names: ${result.browserSecrets.join(', ') || 'none'}`,
    )
    if (allowMissing && result.missing.length) {
      console.log(
        '  REPORT-ONLY: missing required names were explicitly allowed; this does not prove a valid environment.',
      )
    }
  }

  const failures = evaluateAudit(result, { allowMissing })
  if (failures.length) {
    failures.forEach((failure) => console.error(`FAIL ${failure}`))
    return false
  }
  console.log('PASS environment names and policy classification.')
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
    console.error(`FAIL environment key audit: ${error.message}`)
    process.exitCode = 1
  }
}
