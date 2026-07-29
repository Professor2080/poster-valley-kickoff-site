import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const MAX_VERCEL_FUNCTIONS = 12
export const supportedFunctionExtensions = new Set([
  '.cjs',
  '.cts',
  '.js',
  '.mjs',
  '.mts',
  '.ts',
])

const binaryExtensions = new Set([
  '.avif',
  '.gif',
  '.ico',
  '.jpeg',
  '.jpg',
  '.pdf',
  '.png',
  '.webp',
  '.woff',
  '.woff2',
])

const providerCredentialPatterns = [
  {
    label: 'GitHub token',
    pattern: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/,
  },
  {
    label: 'Mollie key',
    pattern: /\b(?:live|test)_[A-Za-z0-9]{24,}\b/,
  },
  {
    label: 'Resend key',
    pattern: /\bre_[A-Za-z0-9]{24,}\b/,
  },
  {
    label: 'Supabase key',
    pattern: /\bsb_(?:publishable|secret)_[A-Za-z0-9._-]{20,}\b/,
  },
  {
    label: 'Vercel token',
    pattern: /\bvercel_[A-Za-z0-9_-]{20,}\b/,
  },
]

const databaseCredentialPattern =
  /\b(?:postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?|redis):\/\/[^/\s:@]+:[^@\s/]+@/i
const jwtPattern =
  /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{16,}\b/
const privateKeyPattern =
  /-----BEGIN (?:EC |OPENSSH |PGP |RSA )?PRIVATE KEY-----/
const sensitiveAssignmentName =
  /(?:SECRET|TOKEN|PASSWORD|PASSWD|API_KEY|PRIVATE_KEY|SERVICE_ROLE)/i
const syntheticLineMarker = ['tooling-secret-scan', ': synthetic'].join('')
const safePlaceholders = new Set([
  '',
  '<secret>',
  '<token>',
  '${secret_value}',
  'example-only',
  '<independent high-entropy secret>',
  '<independent high-entropy secret, at least 32 characters>',
  'replace-me',
  'synthetic-placeholder',
])
const testOnlyPlaceholders = new Set([
  'confirmation-secret',
  'confirmation-proof-test-secret-at-least-32-bytes',
  'confirmation-test-secret-at-least-32-bytes',
  'dedicated-confirmation-secret-longer-than-32-bytes',
  'dedicated-invitation-token-test-secret',
  'origin-confirmation-test-secret-at-least-32-bytes',
  'pv_fixture_abcdefghijklmnopqrstuvwxyz012345',
  'pv_test_abcdefghijklmnopqrstuvwxyz',
  'server-only-test-key',
  'service-role-fixture',
  'service-role-test-key',
  'service-test-key',
  'test-admin-secret',
  'test_fixture_key',
  'token-secret',
])

export const allowedBrowserVariables = new Set([
  'VITE_SUPABASE_PUBLISHABLE_KEY',
  'VITE_SUPABASE_URL',
])

export const serverOnlyVariables = new Set([
  'ADMIN_ACTION_SECRET',
  'ADMIN_CONFIRMATION_SECRET',
  'ADMIN_INVITATION_TOKEN_SECRET',
  'FORM_NOTIFICATION_FROM',
  'FORM_NOTIFICATION_REPLY_TO',
  'FORM_NOTIFICATION_TO',
  'MOLLIE_API_KEY',
  'MOLLIE_TEST_MODE',
  'OPERATIONAL_EMAIL_DELIVERY_ENABLED',
  'OPERATIONAL_EMAIL_FROM',
  'OPERATIONAL_EMAIL_REPLY_TO',
  'POSTER_VALLEY_ENV',
  'RESEND_API_KEY',
  'SITE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_URL',
  'VERSEL_RESEND_API_KEY',
])

function runGit(args, cwd = process.cwd()) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
}

export function repositoryRoot(cwd = process.cwd()) {
  return runGit(['rev-parse', '--show-toplevel'], cwd)
}

export function repositoryFiles(root = repositoryRoot()) {
  const output = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    { cwd: root, encoding: 'utf8' },
  )

  return output
    .split('\0')
    .filter(Boolean)
    .map((file) => file.replaceAll('\\', '/'))
    .sort()
}

function readableText(root, file) {
  if (binaryExtensions.has(path.extname(file).toLowerCase())) {
    return null
  }
  const contents = readFileSync(path.join(root, file))
  if (contents.includes(0)) {
    return null
  }
  return contents.toString('utf8')
}

function location(file, lineNumber, label, variable = '') {
  return `${file}:${lineNumber}: ${label}${variable ? ` (${variable})` : ''}`
}

function safelyDecode(value) {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function normalizeLiteral(value) {
  return value
    .trim()
    .replace(/^['"`]|['"`][,;]?\s*$/g, '')
    .trim()
}

function isSafePlaceholder(value, file) {
  const normalized = normalizeLiteral(value).toLowerCase()
  if (safePlaceholders.has(normalized)) return true
  if (
    /^(?:[A-Za-z0-9 .:/_-]*\$\{[A-Za-z_$][A-Za-z0-9_$]*\})+[A-Za-z0-9 .:/_-]*$/.test(
      normalizeLiteral(value),
    )
  ) {
    return true
  }
  if (/^test\/(?:fixtures\/|.*\.test\.[cm]?[jt]s$)/.test(file)) {
    if (testOnlyPlaceholders.has(normalized)) return true
  }
  return false
}

function assignmentMatches(line) {
  const matches = []
  const patterns = [
    /(?:^|[\s{;,])(?:process\.env\.)?([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*("[^"\r\n]*"|'[^'\r\n]*'|`[^`\r\n]*`)/gi,
    /(?:^|[\s{;,])([A-Za-z_$][A-Za-z0-9_$]*)\s*:\s*("[^"\r\n]*"|'[^'\r\n]*'|`[^`\r\n]*`)/gi,
    /["']([A-Za-z_$][A-Za-z0-9_$]*)["']\s*:\s*("[^"\r\n]*"|'[^'\r\n]*'|`[^`\r\n]*`)/gi,
  ]
  for (const pattern of patterns) {
    for (const match of line.matchAll(pattern)) {
      matches.push({ name: match[1], value: match[2] })
    }
  }
  const environmentAssignment = line.match(
    /^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*(?:#.*)?$/,
  )
  if (environmentAssignment) {
    matches.push({
      name: environmentAssignment[1],
      value: environmentAssignment[2],
    })
  }
  return matches
}

function isCredentialAssignmentName(name) {
  if (!sensitiveAssignmentName.test(name)) return false
  return !/(?:token|secret)(?:_|-)?(?:hash|expires?|expiry|sent|created|updated|id)(?:_|-|$)/i.test(
    name,
  )
}

function browserFile(file) {
  return (
    /^(?:src|public)\//.test(file) ||
    /(?:^|\/)(?:vite|webpack|rollup)\.config\.[cm]?[jt]s$/.test(file) ||
    /\.html$/i.test(file)
  )
}

function maskNonExecutableText(text) {
  let masked = ''
  let state = 'code'
  let escaped = false
  let templateExpressionDepth = null
  const templateReturnDepths = []
  const mask = (character) => (character === '\n' ? '\n' : ' ')

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    const next = text[index + 1]

    if (state === 'line-comment') {
      masked += mask(character)
      if (character === '\n') state = 'code'
      continue
    }
    if (state === 'block-comment') {
      masked += mask(character)
      if (character === '*' && next === '/') {
        masked += ' '
        index += 1
        state = 'code'
      }
      continue
    }
    if (state === 'single-quote' || state === 'double-quote') {
      masked += mask(character)
      if (escaped) {
        escaped = false
      } else if (character === '\\') {
        escaped = true
      } else if (
        (state === 'single-quote' && character === "'") ||
        (state === 'double-quote' && character === '"')
      ) {
        state = 'code'
      }
      continue
    }
    if (state === 'template') {
      masked += mask(character)
      if (escaped) {
        escaped = false
      } else if (character === '\\') {
        escaped = true
      } else if (character === '`') {
        state = 'code'
        templateExpressionDepth = templateReturnDepths.pop() ?? null
      } else if (character === '$' && next === '{') {
        masked += ' '
        index += 1
        state = 'code'
        templateExpressionDepth = 0
      }
      continue
    }

    if (templateExpressionDepth !== null) {
      if (character === '}' && templateExpressionDepth === 0) {
        masked += ' '
        state = 'template'
        templateExpressionDepth = null
        continue
      }
      if (character === '{') templateExpressionDepth += 1
      if (character === '}') templateExpressionDepth -= 1
    }

    if (character === '/' && next === '/') {
      masked += '  '
      index += 1
      state = 'line-comment'
    } else if (character === '/' && next === '*') {
      masked += '  '
      index += 1
      state = 'block-comment'
    } else if (character === "'") {
      masked += ' '
      state = 'single-quote'
    } else if (character === '"') {
      masked += ' '
      state = 'double-quote'
    } else if (character === '`') {
      masked += ' '
      templateReturnDepths.push(templateExpressionDepth)
      templateExpressionDepth = null
      state = 'template'
    } else {
      masked += character
    }
  }

  return masked
}

function lineNumberAt(text, index) {
  return text.slice(0, index).split(/\r?\n/).length
}

const identifierStartPattern = /^[$_\p{ID_Start}]$/u
const identifierContinuePattern = /^[$_\u200C\u200D\p{ID_Continue}]$/u

function unicodeEscapeCharacter(text, index, pattern) {
  if (text[index] !== '\\' || text[index + 1] !== 'u') return null
  let digits
  let end
  const braced = text[index + 2] === '{'
  if (braced) {
    const closingBrace = text.indexOf('}', index + 3)
    if (closingBrace === -1) return null
    digits = text.slice(index + 3, closingBrace)
    end = closingBrace + 1
  } else {
    digits = text.slice(index + 2, index + 6)
    end = index + 6
  }
  if (
    !(braced
      ? /^[0-9A-Fa-f]{1,6}$/.test(digits)
      : /^[0-9A-Fa-f]{4}$/.test(digits))
  ) {
    return null
  }
  const codePoint = Number.parseInt(digits, 16)
  if (codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff)) {
    return null
  }
  const character = String.fromCodePoint(codePoint)
  return pattern.test(character) ? { character, end } : null
}

function identifierCharacter(text, index, pattern) {
  const codePoint = text.codePointAt(index)
  if (codePoint === undefined) return null
  const character = String.fromCodePoint(codePoint)
  return pattern.test(character) ? character : null
}

function tokenizeBrowserCode(text) {
  const code = maskNonExecutableText(text)
  const tokens = []

  for (let index = 0; index < code.length; ) {
    if (/\s/u.test(code[index])) {
      index += 1
      continue
    }

    const start = index
    const escapedStart = unicodeEscapeCharacter(
      code,
      index,
      identifierStartPattern,
    )
    const firstCharacter = identifierCharacter(
      code,
      index,
      identifierStartPattern,
    )
    if (escapedStart !== null || firstCharacter !== null) {
      let escaped = escapedStart !== null
      let value
      if (escapedStart) {
        value = escapedStart.character
        index = escapedStart.end
      } else {
        value = firstCharacter
        index += firstCharacter.length
      }
      while (index < code.length) {
        const escapedContinue = unicodeEscapeCharacter(
          code,
          index,
          identifierContinuePattern,
        )
        if (escapedContinue !== null) {
          escaped = true
          value += escapedContinue.character
          index = escapedContinue.end
          continue
        }
        const character = identifierCharacter(
          code,
          index,
          identifierContinuePattern,
        )
        if (character === null) break
        value += character
        index += character.length
      }
      tokens.push({
        escaped,
        type: 'identifier',
        value,
        lineNumber: lineNumberAt(code, start),
      })
      continue
    }

    const punctuation = code.startsWith('?.', index)
      ? '?.'
      : code[index]
    tokens.push({
      type: 'punctuation',
      value: punctuation,
      lineNumber: lineNumberAt(code, start),
    })
    index += punctuation.length
  }

  return tokens
}

function transparentSource(tokens, start, identifier) {
  let cursor = start
  let wrappers = 0
  while (tokens[cursor]?.value === '(') {
    wrappers += 1
    cursor += 1
  }
  if (
    tokens[cursor]?.type !== 'identifier' ||
    tokens[cursor]?.value !== identifier
  ) {
    return null
  }
  cursor += 1
  for (let index = 0; index < wrappers; index += 1) {
    if (tokens[cursor]?.value !== ')') return null
    cursor += 1
  }
  return { end: cursor, wrapped: wrappers > 0 }
}

function importMetaSource(tokens, start) {
  let cursor = start
  let wrappers = 0
  while (tokens[cursor]?.value === '(') {
    wrappers += 1
    cursor += 1
  }
  const importToken = tokens[cursor]
  const metaToken = tokens[cursor + 2]
  if (
    importToken?.value !== 'import' ||
    tokens[cursor + 1]?.value !== '.' ||
    metaToken?.value !== 'meta'
  ) {
    return null
  }
  cursor += 3
  for (let index = 0; index < wrappers; index += 1) {
    if (tokens[cursor]?.value !== ')') return null
    cursor += 1
  }
  return {
    end: cursor,
    escaped: Boolean(importToken.escaped || metaToken.escaped),
    wrapped: wrappers > 0,
  }
}

function memberAccess(tokens, start) {
  const operator = tokens[start]?.value
  if (operator === '?.' && tokens[start + 1]?.value === '[') {
    return {
      computed: true,
      end: start + 2,
      optional: true,
      property: null,
      propertyEscaped: false,
    }
  }
  if (operator === '.' || operator === '?.') {
    const property = tokens[start + 1]
    if (property?.type !== 'identifier') return null
    return {
      computed: false,
      end: start + 2,
      optional: operator === '?.',
      property: property.value,
      propertyEscaped: property.escaped,
    }
  }
  if (operator === '[') {
    return {
      computed: true,
      end: start + 1,
      optional: false,
      property: null,
      propertyEscaped: false,
    }
  }
  return null
}

function browserExposureIssues(file, text) {
  if (!browserFile(file)) return []

  const issues = []
  const tokens = tokenizeBrowserCode(text)

  for (let index = 0; index < tokens.length; index += 1) {
    const importMeta = importMetaSource(tokens, index)
    if (importMeta) {
      const envAccess = memberAccess(tokens, importMeta.end)
      if (!envAccess) continue
      if (!envAccess.computed && envAccess.property !== 'env') continue
      const isDirectEnv =
        !envAccess.computed &&
        !envAccess.optional &&
        !envAccess.propertyEscaped &&
        envAccess.property === 'env'

      if (!isDirectEnv || importMeta.escaped || importMeta.wrapped) {
        issues.push(
          location(
            file,
            tokens[index].lineNumber,
            'indirect-import-meta-env-access; use direct dot-access with an explicitly allowed browser-safe name',
          ),
        )
        continue
      }

      const variableAccess = memberAccess(tokens, envAccess.end)
      if (
        variableAccess &&
        !variableAccess.computed &&
        !variableAccess.optional &&
        !variableAccess.propertyEscaped &&
        allowedBrowserVariables.has(variableAccess.property)
      ) {
        continue
      }

      issues.push(
        location(
          file,
          tokens[index].lineNumber,
          variableAccess &&
            !variableAccess.computed &&
            !variableAccess.optional
            ? 'unapproved-browser-env-name; use direct dot-access with an explicitly allowed browser-safe name'
            : 'indirect-import-meta-env-access; use direct dot-access with an explicitly allowed browser-safe name',
        ),
      )
      continue
    }

    const processSource = transparentSource(tokens, index, 'process')
    if (!processSource) continue
    const processAccess = memberAccess(tokens, processSource.end)
    if (
      !processAccess ||
      (!processAccess.computed && processAccess.property !== 'env')
    ) {
      continue
    }
    issues.push(
      location(
        file,
        tokens[index].lineNumber,
        'client-process-env-access; move server-only configuration to server code',
      ),
    )
  }

  return issues
}

export function scanTextForSecrets(file, text) {
  const issues = []
  const lines = text.split(/\r?\n/)

  lines.forEach((line, index) => {
    const lineNumber = index + 1
    const hasSyntheticMarker = line.includes(syntheticLineMarker)
    const markerAllowed =
      file.startsWith('docs/') ||
      file.startsWith('test/fixtures/') ||
      /^test\/tooling-.*\.test\.[cm]?[jt]s$/.test(file)

    const decoded = safelyDecode(line)
    for (const { label, pattern } of providerCredentialPatterns) {
      if (pattern.test(line) || (decoded !== line && pattern.test(decoded))) {
        issues.push(location(file, lineNumber, `possible tracked ${label}`))
      }
    }
    if (
      databaseCredentialPattern.test(line) ||
      (decoded !== line && databaseCredentialPattern.test(decoded))
    ) {
      issues.push(
        location(file, lineNumber, 'database URL or DSN contains credentials'),
      )
    }
    if (
      jwtPattern.test(line) ||
      (decoded !== line && jwtPattern.test(decoded))
    ) {
      issues.push(location(file, lineNumber, 'possible tracked JWT-like token'))
    }
    if (
      privateKeyPattern.test(line) ||
      (decoded !== line && privateKeyPattern.test(decoded))
    ) {
      issues.push(location(file, lineNumber, 'possible tracked private key'))
    }

    const assignments = assignmentMatches(line)
    for (const { name, value } of assignments) {
      if (
        isCredentialAssignmentName(name) &&
        !isSafePlaceholder(value, file) &&
        (hasSyntheticMarker || normalizeLiteral(value).length >= 12)
      ) {
        issues.push(
          location(file, lineNumber, 'non-placeholder sensitive assignment', name),
        )
      }
    }
    if (hasSyntheticMarker && !markerAllowed) {
      issues.push(
        location(
          file,
          lineNumber,
          'synthetic secret-scan marker is not allowed in this path',
        ),
      )
    }
  })

  issues.push(...browserExposureIssues(file, text))
  return [...new Set(issues)]
}

export function checkTextFiles(
  root = repositoryRoot(),
  files = repositoryFiles(root),
) {
  const issues = []
  for (const file of files) {
    const text = readableText(root, file)
    if (text === null) continue
    text.split(/\r?\n/).forEach((line, index) => {
      if (/^(?:<{7}|={7}|>{7})(?:\s|$)/.test(line)) {
        issues.push(`${file}:${index + 1}: conflict marker`)
      }
      if (/[ \t]+$/.test(line)) {
        issues.push(`${file}:${index + 1}: trailing whitespace`)
      }
    })
  }
  return issues
}

export function checkSecrets(
  root = repositoryRoot(),
  files = repositoryFiles(root),
) {
  const issues = []
  for (const file of files) {
    const text = readableText(root, file)
    if (text === null) continue
    issues.push(...scanTextForSecrets(file, text))
  }
  return [...new Set(issues)]
}

function isHelper(file) {
  const basename = path.posix.basename(file)
  return basename.startsWith('_') || /\.d\.(?:ts|mts|cts)$/.test(basename)
}

export function analyzeVercelFunctions(files) {
  const entrypoints = []
  const helpers = []
  const unsupported = []

  for (const file of files) {
    if (!file.startsWith('api/')) continue
    const extension = path.posix.extname(file).toLowerCase()
    if (!supportedFunctionExtensions.has(extension)) {
      unsupported.push(file)
    } else if (isHelper(file)) {
      helpers.push(file)
    } else {
      entrypoints.push(file)
    }
  }
  return {
    entrypoints: entrypoints.sort(),
    helpers: helpers.sort(),
    unsupported: unsupported.sort(),
  }
}

export function vercelFunctionEntrypoints(
  root = repositoryRoot(),
  files = repositoryFiles(root),
) {
  return analyzeVercelFunctions(files).entrypoints
}

export function checkFunctionBudget(
  root = repositoryRoot(),
  files = repositoryFiles(root),
) {
  const analysis = analyzeVercelFunctions(files)
  const issues = analysis.unsupported.map(
    (file) =>
      `${file}: unsupported file type under api/; classify or relocate it before relying on the function budget`,
  )
  if (analysis.entrypoints.length > MAX_VERCEL_FUNCTIONS) {
    issues.push(
      `Vercel function budget exceeded: ${analysis.entrypoints.length}/${MAX_VERCEL_FUNCTIONS}`,
      ...analysis.entrypoints.map((file) => `  ${file}`),
    )
  }
  return issues
}

function report(label, issues, detail = '') {
  if (issues.length === 0) {
    console.log(`PASS ${label}${detail ? ` (${detail})` : ''}`)
    return true
  }
  console.error(`FAIL ${label}`)
  issues.forEach((issue) => console.error(`  ${issue}`))
  return false
}

export function run(selected = 'all', root = repositoryRoot()) {
  const files = repositoryFiles(root)
  const valid = new Set(['all', 'function-budget', 'secrets', 'text'])
  if (!valid.has(selected)) {
    throw new Error(
      `Unknown check '${selected}'. Expected one of: ${[...valid].join(', ')}`,
    )
  }

  let passed = true
  if (selected === 'all' || selected === 'text') {
    passed =
      report(
        'conflict markers and trailing whitespace',
        checkTextFiles(root, files),
      ) && passed
  }
  if (selected === 'all' || selected === 'secrets') {
    passed =
      report(
        'defense-in-depth tracked-secret and browser exposure scan',
        checkSecrets(root, files),
      ) && passed
  }
  if (selected === 'all' || selected === 'function-budget') {
    const analysis = analyzeVercelFunctions(files)
    passed =
      report(
        'Vercel function budget and api/ file classification',
        checkFunctionBudget(root, files),
        `${analysis.entrypoints.length}/${MAX_VERCEL_FUNCTIONS}`,
      ) && passed
  }
  return passed
}

const isMain =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href ===
    pathToFileURL(fileURLToPath(import.meta.url)).href

if (isMain) {
  try {
    if (!run(process.argv[2] ?? 'all')) {
      process.exitCode = 1
    }
  } catch (error) {
    console.error(`FAIL repository checks: ${error.message}`)
    process.exitCode = 1
  }
}
