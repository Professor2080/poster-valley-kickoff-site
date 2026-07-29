import assert from 'node:assert/strict'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  auditEnvironmentNames,
  environmentPolicy,
  evaluateAudit,
  parseEnvironmentNames,
} from '../scripts/tooling/environment-key-audit.mjs'
import {
  checkGovernance,
  readSkillRegister,
  validateRegisterStructure,
} from '../scripts/tooling/governance-checks.mjs'
import {
  analyzeVercelFunctions,
  checkFunctionBudget,
  checkSecrets,
  checkTextFiles,
  repositoryFiles,
  scanTextForSecrets,
  vercelFunctionEntrypoints,
} from '../scripts/tooling/repository-checks.mjs'
import {
  expectedNodeVersion,
  expectedNpmVersion,
  validateToolVersions,
} from '../scripts/tooling/tool-versions.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const unicodeEAcute = String.fromCodePoint(0x00e9)
const unicodeVariable = String.fromCodePoint(0x53d8, 0x91cf)

function runtimeText(parts) {
  return parts.join('')
}

test('environment names are parsed without retaining values', () => {
  const names = parseEnvironmentNames(`
    # comment
    export ALPHA=do-not-print
    BETA="another-secret"
    ALPHA=repeated
  `)
  assert.deepEqual(names, ['ALPHA', 'BETA'])
  assert.equal(JSON.stringify(names).includes('do-not-print'), false)
  assert.equal(JSON.stringify(names).includes('another-secret'), false)
})

test('.env.example and environment policy stay synchronized', () => {
  const exampleNames = parseEnvironmentNames(
    readFileSync(path.join(root, '.env.example'), 'utf8'),
  )
  const result = auditEnvironmentNames({ exampleNames })
  assert.deepEqual(result.missingPolicy, [])
  assert.deepEqual(result.stalePolicy, [])
  assert.equal(environmentPolicy.VITE_SUPABASE_URL.exposure, 'browser-safe')
  assert.equal(environmentPolicy.SUPABASE_SERVICE_ROLE_KEY.exposure, 'server-only')
  assert.deepEqual(environmentPolicy.RESEND_API_KEY.allowedIn, ['production'])
  assert.ok(
    environmentPolicy.ADMIN_INVITATION_TOKEN_SECRET.requiredIn.includes(
      'staging',
    ),
  )
  assert.ok(
    environmentPolicy.ADMIN_CONFIRMATION_SECRET.requiredIn.includes('staging'),
  )
})

test('environment audit fails closed on missing, disallowed, and browser-secret names', () => {
  const exampleNames = Object.keys(environmentPolicy)
  const stagingRequired = exampleNames.filter((name) =>
    environmentPolicy[name].requiredIn.includes('staging'),
  )
  const complete = auditEnvironmentNames({
    environment: 'staging',
    exampleNames,
    suppliedNames: stagingRequired,
  })
  assert.deepEqual(evaluateAudit(complete), [])

  const oneMissing = auditEnvironmentNames({
    environment: 'staging',
    exampleNames,
    suppliedNames: stagingRequired.slice(1),
  })
  assert.equal(oneMissing.missing.length, 1)
  assert.match(evaluateAudit(oneMissing)[0], /missing required name/)
  assert.deepEqual(evaluateAudit(oneMissing, { allowMissing: true }), [])

  const severalMissing = auditEnvironmentNames({
    environment: 'staging',
    exampleNames,
    suppliedNames: stagingRequired.slice(3),
  })
  assert.ok(severalMissing.missing.length >= 3)
  assert.ok(evaluateAudit(severalMissing).length >= 3)

  const productionNameInPreview = auditEnvironmentNames({
    environment: 'preview',
    exampleNames,
    suppliedNames: [...stagingRequired, 'OPERATIONAL_EMAIL_DELIVERY_ENABLED'],
  })
  assert.ok(
    productionNameInPreview.disallowed.includes(
      'OPERATIONAL_EMAIL_DELIVERY_ENABLED',
    ),
  )
  const productionNameInStaging = auditEnvironmentNames({
    environment: 'staging',
    exampleNames,
    suppliedNames: [...stagingRequired, 'OPERATIONAL_EMAIL_DELIVERY_ENABLED'],
  })
  assert.ok(
    productionNameInStaging.disallowed.includes(
      'OPERATIONAL_EMAIL_DELIVERY_ENABLED',
    ),
  )

  const browserSecret = auditEnvironmentNames({
    environment: 'preview',
    exampleNames,
    suppliedNames: [...stagingRequired, 'VITE_ADMIN_SECRET'],
  })
  assert.ok(browserSecret.browserSecrets.includes('VITE_ADMIN_SECRET'))
  assert.ok(browserSecret.unexpected.includes('VITE_ADMIN_SECRET'))
})

test('environment audit CLI never prints values', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'pv-env-audit-'))
  const namesFile = path.join(directory, 'names.env')
  const sentinel = 'sentinel-value-must-never-appear'
  writeFileSync(
    namesFile,
    `SUPABASE_URL=${sentinel}\nADMIN_CONFIRMATION_SECRET=${sentinel}\n`,
  )
  try {
    const result = spawnSync(
      process.execPath,
      [
        path.join(root, 'scripts', 'tooling', 'environment-key-audit.mjs'),
        '--names-file',
        namesFile,
        '--environment',
        'staging',
      ],
      { cwd: root, encoding: 'utf8' },
    )
    assert.equal(result.status, 1)
    assert.doesNotMatch(`${result.stdout}${result.stderr}`, new RegExp(sentinel))

    const reportOnly = spawnSync(
      process.execPath,
      [
        path.join(root, 'scripts', 'tooling', 'environment-key-audit.mjs'),
        '--names-file',
        namesFile,
        '--environment',
        'staging',
        '--allow-missing',
      ],
      { cwd: root, encoding: 'utf8' },
    )
    assert.equal(reportOnly.status, 0, reportOnly.stderr)
    assert.match(reportOnly.stdout, /REPORT-ONLY/)
    assert.doesNotMatch(
      `${reportOnly.stdout}${reportOnly.stderr}`,
      new RegExp(sentinel),
    )
  } finally {
    rmSync(directory, { force: true, recursive: true })
  }
})

test('repository checks cover untracked files and pass on this tree', () => {
  const files = repositoryFiles(root)
  assert.ok(files.includes('scripts/tooling/repository-checks.mjs'))
  assert.deepEqual(checkTextFiles(root, files), [])
  assert.deepEqual(checkSecrets(root, files), [])
})

test('Vercel function budget recognizes all supported extensions and helpers', () => {
  const files = repositoryFiles(root)
  assert.equal(vercelFunctionEntrypoints(root, files).length, 12)
  assert.deepEqual(checkFunctionBudget(root, files), [])

  for (const extension of ['.js', '.mjs', '.cjs', '.ts', '.mts', '.cts']) {
    const candidate = `api/synthetic-route${extension}`
    const analysis = analyzeVercelFunctions([...files, candidate])
    assert.ok(analysis.entrypoints.includes(candidate))
    assert.match(
      checkFunctionBudget(root, [...files, candidate]).join('\n'),
      /13\/12/,
    )
  }

  const helper = 'api/admin/_synthetic-helper.ts'
  assert.ok(
    analyzeVercelFunctions([...files, helper]).helpers.includes(helper),
  )
  assert.deepEqual(checkFunctionBudget(root, [...files, helper]), [])

  const nested = 'api/synthetic/deep/route.mts'
  assert.ok(
    analyzeVercelFunctions([...files, nested]).entrypoints.includes(nested),
  )

  const unsupported = 'api/synthetic-route.py'
  assert.ok(
    analyzeVercelFunctions([...files, unsupported]).unsupported.includes(
      unsupported,
    ),
  )
  assert.match(
    checkFunctionBudget(root, [...files, unsupported]).join('\n'),
    /unsupported file type/,
  )
})

test('function-budget CLI exits nonzero for a thirteenth JavaScript or TypeScript function', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'pv-function-budget-'))
  try {
    spawnSync('git', ['init', '--initial-branch=main', directory], {
      encoding: 'utf8',
    })
    const apiDirectory = path.join(directory, 'api')
    mkdirSync(apiDirectory)
    for (let index = 1; index <= 12; index += 1) {
      writeFileSync(path.join(apiDirectory, `route-${index}.js`), 'export default 1\n')
    }
    const extraJs = path.join(apiDirectory, 'extra.js')
    writeFileSync(extraJs, 'export default 1\n')
    const jsResult = spawnSync(
      process.execPath,
      [path.join(root, 'scripts', 'tooling', 'repository-checks.mjs'), 'function-budget'],
      { cwd: directory, encoding: 'utf8' },
    )
    assert.equal(jsResult.status, 1)
    assert.match(`${jsResult.stdout}${jsResult.stderr}`, /13\/12/)

    rmSync(extraJs)
    writeFileSync(path.join(apiDirectory, 'extra.ts'), 'export default 1\n')
    const tsResult = spawnSync(
      process.execPath,
      [path.join(root, 'scripts', 'tooling', 'repository-checks.mjs'), 'function-budget'],
      { cwd: directory, encoding: 'utf8' },
    )
    assert.equal(tsResult.status, 1)
    assert.match(`${tsResult.stdout}${tsResult.stderr}`, /13\/12/)
  } finally {
    rmSync(directory, { force: true, recursive: true })
  }
})

test('secret scan detects every claimed synthetic category without echoing values', () => {
  const fixtures = [
    ['dsn', runtimeText(['DATABASE_URL="postgresql://synthetic:', 'p%40ss', '@db.example.test/app"'])],
    ['Supabase', runtimeText(['SUPABASE_SERVICE_ROLE_KEY="sb_secret_', 'A'.repeat(28), '"'])],
    ['Mollie test', runtimeText(['MOLLIE_API_KEY="test_', 'B'.repeat(30), '"'])],
    ['Mollie live', runtimeText(['MOLLIE_API_KEY="live_', 'B'.repeat(30), '"'])],
    ['Resend', runtimeText(['RESEND_API_KEY="re_', 'C'.repeat(30), '"'])],
    ['Vercel', runtimeText(['VERCEL_TOKEN="vercel_', 'D'.repeat(24), '"'])],
    ['private key', runtimeText(['-----BEGIN ', 'PRIVATE KEY-----'])],
    ['JWT', runtimeText(['TOKEN="eyJ', 'A'.repeat(24), '.', 'B'.repeat(24), '.', 'C'.repeat(20), '"'])],
    ['admin assignment', runtimeText(['ADMIN_CONFIRMATION_', 'SECRET = "realistic-random-value"'])],
    ['invitation assignment', runtimeText(['ADMIN_INVITATION_TOKEN_', 'SECRET = "another-random-value"'])],
    ['password assignment', runtimeText(['DATABASE_', 'PASSWORD = "random-password-value"'])],
    ['browser bracket', runtimeText(['const value = import.meta.env[', "'ADMIN_CONFIRMATION_SECRET'", ']'])],
    ['browser destructuring', runtimeText(['const { ADMIN_INVITATION_TOKEN_', 'SECRET } = import.meta.env'])],
    ['browser process.env', runtimeText(['const value = process.env.', 'SUPABASE_SERVICE_ROLE_KEY'])],
    ['client bundle pass-through', runtimeText(['define: { value: process.env.', 'ADMIN_ACTION_SECRET', ' }'])],
  ]

  for (const [label, fixture] of fixtures) {
    const file =
      label.startsWith('browser') || label.startsWith('client')
        ? 'src/synthetic.ts'
        : 'synthetic.fixture'
    const issues = scanTextForSecrets(file, fixture)
    assert.ok(issues.length > 0, `${label} should be detected`)
    assert.equal(
      issues.some((issue) => issue.includes(fixture)),
      false,
      `${label} value must not be echoed`,
    )
  }
})

test('synthetic marker never suppresses production-shaped credentials or sensitive assignments', () => {
  const marker = ' # tooling-secret-scan: synthetic'
  const jwt = runtimeText([
    'eyJ',
    'A'.repeat(24),
    '.',
    'B'.repeat(24),
    '.',
    'C'.repeat(20),
  ])
  const dsn = runtimeText([
    'postgresql://synthetic-user:',
    'synthetic-password',
    '@db.example.test/app',
  ])
  const fixtures = [
    ['Mollie test', runtimeText(['MOLLIE_API_KEY=test_', 'A'.repeat(30), marker])],
    ['Mollie live', runtimeText(['MOLLIE_API_KEY=live_', 'B'.repeat(30), marker])],
    [
      'Supabase secret',
      runtimeText([
        'SUPABASE_SERVICE_ROLE_KEY=sb_secret_',
        'C'.repeat(30),
        marker,
      ]),
    ],
    ['Resend', runtimeText(['RESEND_API_KEY=re_', 'D'.repeat(30), marker])],
    ['Vercel', runtimeText(['VERCEL_TOKEN=vercel_', 'E'.repeat(26), marker])],
    ['PostgreSQL DSN', `DATABASE_URL=${dsn}${marker}`],
    ['percent-encoded DSN', `DATABASE_URL=${encodeURIComponent(dsn)}${marker}`],
    ['JWT', `TOKEN=${jwt}${marker}`],
    [
      'PEM private key',
      runtimeText(['-----BEGIN ', 'PRIVATE KEY-----', marker]),
    ],
    [
      'admin secret',
      runtimeText(['ADMIN_ACTION_SECRET=', 'F'.repeat(28), marker]),
    ],
    [
      'confirmation secret',
      runtimeText(['ADMIN_CONFIRMATION_SECRET=', 'G'.repeat(28), marker]),
    ],
    [
      'invitation secret',
      runtimeText(['ADMIN_INVITATION_TOKEN_SECRET=', 'H'.repeat(28), marker]),
    ],
    [
      'general API key',
      runtimeText(['EXAMPLE_API_KEY=', 'I'.repeat(28), marker]),
    ],
  ]

  for (const [label, fixture] of fixtures) {
    const output = scanTextForSecrets('docs/synthetic-example.md', fixture).join(
      '\n',
    )
    assert.notEqual(output, '', `${label} should remain detectable`)
    assert.equal(output.includes(fixture), false, `${label} line must not leak`)
    for (const sensitiveFragment of fixture
      .replace(marker, '')
      .split('=')
      .slice(1)) {
      if (sensitiveFragment.length >= 12) {
        assert.equal(
          output.includes(sensitiveFragment),
          false,
          `${label} value must not leak`,
        )
      }
    }
  }
})

test('secret scan allows only narrow marked placeholders and ordinary prose', () => {
  const safe = [
    ['.env.example', 'ADMIN_CONFIRMATION_SECRET=\nTOKEN=replace-me'],
    ['docs/example.md', 'The word secret can appear in ordinary prose.'],
    [
      'docs/example.md',
      'TOKEN= # tooling-secret-scan: synthetic',
    ],
    [
      'docs/example.md',
      'TOKEN=replace-me # tooling-secret-scan: synthetic',
    ],
    [
      'docs/example.md',
      'TOKEN=<secret> # tooling-secret-scan: synthetic',
    ],
    [
      'docs/example.md',
      'ADMIN_CONFIRMATION_SECRET=synthetic-placeholder # tooling-secret-scan: synthetic',
    ],
  ]
  for (const [file, text] of safe) {
    assert.deepEqual(scanTextForSecrets(file, text), [])
  }
  assert.match(
    scanTextForSecrets(
      'src/not-a-fixture.ts',
      'TOKEN=replace-me # tooling-secret-scan: synthetic',
    ).join('\n'),
    /marker is not allowed/,
  )
  assert.match(
    scanTextForSecrets(
      'docs/example.md',
      'TOKEN=not-approved # tooling-secret-scan: synthetic',
    ).join('\n'),
    /non-placeholder sensitive assignment/,
  )
})

test('secret scan CLI redacts marked credential values from stdout and stderr', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'pv-secret-output-'))
  const credential = runtimeText(['live_', 'Z'.repeat(30)])
  try {
    spawnSync('git', ['init', '--initial-branch=main', directory], {
      encoding: 'utf8',
    })
    const docsDirectory = path.join(directory, 'docs')
    mkdirSync(docsDirectory)
    writeFileSync(
      path.join(docsDirectory, 'synthetic.md'),
      `MOLLIE_API_KEY=${credential} # tooling-secret-scan: synthetic\n`,
    )
    const result = spawnSync(
      process.execPath,
      [
        path.join(root, 'scripts', 'tooling', 'repository-checks.mjs'),
        'secrets',
      ],
      { cwd: directory, encoding: 'utf8' },
    )
    const output = `${result.stdout}${result.stderr}`
    assert.equal(result.status, 1)
    assert.match(output, /possible tracked Mollie key/)
    assert.doesNotMatch(output, new RegExp(credential))
  } finally {
    rmSync(directory, { force: true, recursive: true })
  }
})

test('browser environment policy allows only exact direct allowlisted dot access', () => {
  const blocked = [
    [
      'Unicode URL suffix',
      `const value = import.meta.env.VITE_SUPABASE_URL${unicodeEAcute}`,
    ],
    [
      'Unicode URL word suffix',
      `const value = import.meta.env.VITE_SUPABASE_URL${unicodeVariable}`,
    ],
    [
      'underscore URL suffix',
      'const value = import.meta.env.VITE_SUPABASE_URL_',
    ],
    [
      'numeric URL suffix',
      'const value = import.meta.env.VITE_SUPABASE_URL2',
    ],
    [
      'Unicode publishable-key suffix',
      `const value = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY${unicodeEAcute}`,
    ],
    [
      'escaped Unicode URL suffix',
      'const value = import.meta.env.VITE_SUPABASE_URL\\u00e9',
    ],
    [
      'escaped import-meta env source',
      'const value = import.meta.\\u0065nv.ADMIN_CONFIRMATION_SECRET',
    ],
    [
      'server-only direct name',
      'const value = import.meta.env.ADMIN_CONFIRMATION_SECRET',
    ],
    [
      'server-only bracket name',
      "const value = import.meta.env['ADMIN_CONFIRMATION_SECRET']",
    ],
    [
      'server-only fixed template name',
      'const value = import.meta.env[`ADMIN_CONFIRMATION_SECRET`]',
    ],
    [
      'server-only optional name',
      'const value = import.meta.env?.ADMIN_CONFIRMATION_SECRET',
    ],
    [
      'safe-name alias',
      'const runtimeEnv = import.meta.env\nruntimeEnv.VITE_SUPABASE_URL',
    ],
    [
      'multiline alias with comment',
      'const runtimeEnv =\n  /* browser configuration */\n  import.meta.env\nruntimeEnv.VITE_SUPABASE_URL',
    ],
    [
      'multiline alias with line comment',
      'const runtimeEnv =\n  // browser configuration\n  import.meta.env\nruntimeEnv.VITE_SUPABASE_URL',
    ],
    [
      'let alias',
      'let runtimeEnv = import.meta.env\nruntimeEnv.VITE_SUPABASE_URL',
    ],
    [
      'var alias',
      'var runtimeEnv = import.meta.env\nruntimeEnv.VITE_SUPABASE_URL',
    ],
    [
      'parenthesized alias',
      'const runtimeEnv = (import.meta.env)\nruntimeEnv.VITE_SUPABASE_URL',
    ],
    [
      'typed alias',
      'const runtimeEnv: ImportMetaEnv = import.meta.env\nruntimeEnv.VITE_SUPABASE_URL',
    ],
    [
      'safe-name destructuring',
      'const { VITE_SUPABASE_URL } = import.meta.env',
    ],
    [
      'safe-name bracket access',
      "const value = import.meta.env['VITE_SUPABASE_URL']",
    ],
    [
      'safe-name optional access',
      'const value = import.meta.env?.VITE_SUPABASE_URL',
    ],
    [
      'safe-name fixed template access',
      'const value = import.meta.env[`VITE_SUPABASE_URL`]',
    ],
    [
      'safe-name computed access',
      "const key = 'VITE_SUPABASE_URL'\nconst value = import.meta.env[key]",
    ],
    [
      'object pass-through',
      'const config = { env: import.meta.env }\nconfig.env.VITE_SUPABASE_URL',
    ],
    [
      'property pass-through',
      'const config = {}\nconfig.env = import.meta.env\nconfig.env.VITE_SUPABASE_URL',
    ],
    [
      'function pass-through',
      'function expose(candidate) { return candidate.VITE_SUPABASE_URL }\nexpose(import.meta.env)',
    ],
    [
      'alias of alias',
      'const runtimeEnv = import.meta.env\nconst secondEnv = runtimeEnv\nsecondEnv.VITE_SUPABASE_URL',
    ],
    [
      'exported alias',
      'const runtimeEnv = import.meta.env\nexport { runtimeEnv }',
    ],
    [
      'process.env direct access',
      'const value = process.env.VITE_SUPABASE_URL',
    ],
    [
      'process.env alias',
      'const runtimeEnv = process.env\nruntimeEnv.VITE_SUPABASE_URL',
    ],
    [
      'parenthesized process',
      'const value = (process).env.SUPABASE_SERVICE_ROLE_KEY',
    ],
    [
      'nested parenthesized process',
      'const value = ((process)).env.SUPABASE_SERVICE_ROLE_KEY',
    ],
    [
      'optional parenthesized process',
      'const value = (process)?.env.SUPABASE_SERVICE_ROLE_KEY',
    ],
    [
      'parenthesized process bracket',
      "const value = (process)['env'].ADMIN_CONFIRMATION_SECRET",
    ],
    [
      'parenthesized process template',
      'const value = (process)[`env`].ADMIN_CONFIRMATION_SECRET',
    ],
    [
      'optional process bracket',
      "const value = process?.['env'].ADMIN_CONFIRMATION_SECRET",
    ],
    [
      'escaped process env source',
      'const value = (process).\\u0065nv.ADMIN_CONFIRMATION_SECRET',
    ],
    [
      'optional import-meta env',
      'const value = import.meta?.env.ADMIN_CONFIRMATION_SECRET',
    ],
    [
      'bracket import-meta env',
      "const value = import.meta['env'].ADMIN_CONFIRMATION_SECRET",
    ],
    [
      'double-quoted import-meta env',
      'const value = import.meta["env"].ADMIN_CONFIRMATION_SECRET',
    ],
    [
      'template import-meta env',
      'const value = import.meta[`env`].ADMIN_CONFIRMATION_SECRET',
    ],
    [
      'parenthesized import-meta env',
      'const value = (import.meta).env.ADMIN_CONFIRMATION_SECRET',
    ],
    [
      'optional parenthesized import-meta env',
      'const value = (import.meta)?.env.ADMIN_CONFIRMATION_SECRET',
    ],
    [
      'parenthesized import-meta bracket env',
      "const value = (import.meta)['env'].ADMIN_CONFIRMATION_SECRET",
    ],
    [
      'safe name through optional import-meta env',
      'const value = import.meta?.env.VITE_SUPABASE_URL',
    ],
    [
      'safe name through bracket import-meta env',
      "const value = import.meta['env'].VITE_SUPABASE_URL",
    ],
    [
      'safe name through parenthesized import-meta env',
      'const value = (import.meta).env.VITE_SUPABASE_URL',
    ],
  ]

  for (const [label, fixture] of blocked) {
    const output = scanTextForSecrets('src/synthetic-client.ts', fixture).join(
      '\n',
    )
    assert.notEqual(output, '', `${label} should be detected`)
    assert.equal(output.includes(fixture), false, `${label} must not echo input`)
  }

  assert.deepEqual(
    scanTextForSecrets(
      'src/synthetic-client.ts',
      [
        'const url = import.meta.env.VITE_SUPABASE_URL',
        'const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY',
      ].join('\n'),
    ),
    [],
  )
  assert.deepEqual(
    scanTextForSecrets(
      'src/lib/synthetic-client.ts',
      'export const url = import.meta.env.VITE_SUPABASE_URL',
    ),
    [],
  )
  assert.deepEqual(
    scanTextForSecrets(
      'src/components/SyntheticClient.tsx',
      [
        'export function SyntheticClient() {',
        '  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY',
        '  return <span data-key={key}>Synthetic</span>',
        '}',
      ].join('\n'),
    ),
    [],
  )
  assert.deepEqual(
    scanTextForSecrets(
      'src/synthetic-client.ts',
      'const env = getLocalConfig()\nenv.ADMIN_CONFIRMATION_SECRET',
    ),
    [],
  )
  assert.deepEqual(
    scanTextForSecrets(
      'src/synthetic-client.ts',
      [
        'const runtimeEnv = getLocalConfig()',
        'const config = { env: runtimeEnv }',
        'config.env.VITE_SUPABASE_URL',
      ].join('\n'),
    ),
    [],
  )
  assert.deepEqual(
    scanTextForSecrets(
      'src/synthetic-client.ts',
      [
        '// import.meta.env.ADMIN_CONFIRMATION_SECRET',
        "const example = 'process.env.SUPABASE_SERVICE_ROLE_KEY'",
        'const local = { env: { VITE_SUPABASE_URL: "synthetic" } }',
        'const process = { status: "synthetic" }',
        'const status = process.status',
        'const processLike = { env: "synthetic" }',
        'const meta = { env: "synthetic" }',
      ].join('\n'),
    ),
    [],
  )
  assert.deepEqual(
    scanTextForSecrets(
      'api/synthetic-server.js',
      'const value = process.env.ADMIN_CONFIRMATION_SECRET',
    ),
    [],
  )
  assert.deepEqual(
    scanTextForSecrets(
      'scripts/synthetic-server.mjs',
      'const value = process.env.ADMIN_CONFIRMATION_SECRET',
    ),
    [],
  )
  assert.deepEqual(
    scanTextForSecrets(
      'test/synthetic-server.test.js',
      "process.env.SYNTHETIC_TEST_VALUE = 'synthetic-placeholder'",
    ),
    [],
  )
})

test('browser environment CLI fails closed for indirect forms without echoing values', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'poster-valley-browser-env-'))
  const clientDirectory = path.join(directory, 'src')
  const clientFile = path.join(clientDirectory, 'synthetic-client.mjs')
  const sentinel = 'synthetic-browser-sentinel-do-not-echo'
  const blocked = [
    [
      'Unicode URL suffix',
      `import.meta.env.VITE_SUPABASE_URL${unicodeEAcute}`,
    ],
    [
      'Unicode URL word suffix',
      `import.meta.env.VITE_SUPABASE_URL${unicodeVariable}`,
    ],
    ['underscore URL suffix', 'import.meta.env.VITE_SUPABASE_URL_'],
    ['numeric URL suffix', 'import.meta.env.VITE_SUPABASE_URL2'],
    [
      'Unicode publishable-key suffix',
      `import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY${unicodeEAcute}`,
    ],
    [
      'escaped Unicode URL suffix',
      'import.meta.env.VITE_SUPABASE_URL\\u00e9',
    ],
    [
      'escaped import-meta env source',
      'import.meta.\\u0065nv.ADMIN_CONFIRMATION_SECRET',
    ],
    ['server-only direct name', 'import.meta.env.ADMIN_CONFIRMATION_SECRET'],
    [
      'server-only bracket name',
      "import.meta.env['ADMIN_CONFIRMATION_SECRET']",
    ],
    [
      'server-only template name',
      'import.meta.env[`ADMIN_CONFIRMATION_SECRET`]',
    ],
    [
      'server-only optional name',
      'import.meta.env?.ADMIN_CONFIRMATION_SECRET',
    ],
    ['safe-name alias', 'const runtimeEnv = import.meta.env'],
    ['multiline alias', 'const runtimeEnv =\n/* comment */\nimport.meta.env'],
    [
      'multiline line-comment alias',
      'const runtimeEnv =\n// comment\nimport.meta.env',
    ],
    ['let alias', 'let runtimeEnv = import.meta.env'],
    ['var alias', 'var runtimeEnv = import.meta.env'],
    ['destructuring', 'const { VITE_SUPABASE_URL } = import.meta.env'],
    ['bracket access', "import.meta.env['VITE_SUPABASE_URL']"],
    ['optional access', 'import.meta.env?.VITE_SUPABASE_URL'],
    ['template access', 'import.meta.env[`VITE_SUPABASE_URL`]'],
    ['computed access', "const key = 'VITE_SUPABASE_URL'\nimport.meta.env[key]"],
    ['object pass-through', 'const config = { env: import.meta.env }'],
    ['function pass-through', 'consume(import.meta.env)'],
    ['export', 'export const runtimeEnv = import.meta.env'],
    ['return', 'function runtimeEnv() { return import.meta.env }'],
    ['process.env', 'process.env.VITE_SUPABASE_URL'],
    ['parenthesized process', '(process).env.SUPABASE_SERVICE_ROLE_KEY'],
    [
      'nested parenthesized process',
      '((process)).env.SUPABASE_SERVICE_ROLE_KEY',
    ],
    [
      'commented parenthesized process',
      '(process /* comment */).env.SUPABASE_SERVICE_ROLE_KEY',
    ],
    ['optional parenthesized process', '(process)?.env.SUPABASE_SERVICE_ROLE_KEY'],
    [
      'parenthesized process bracket',
      "(process)['env'].ADMIN_CONFIRMATION_SECRET",
    ],
    [
      'parenthesized process template',
      '(process)[`env`].ADMIN_CONFIRMATION_SECRET',
    ],
    [
      'optional process bracket',
      "process?.['env'].ADMIN_CONFIRMATION_SECRET",
    ],
    [
      'escaped process env source',
      '(process).\\u0065nv.ADMIN_CONFIRMATION_SECRET',
    ],
    ['optional import-meta env', 'import.meta?.env.ADMIN_CONFIRMATION_SECRET'],
    [
      'single-quoted import-meta env',
      "import.meta['env'].ADMIN_CONFIRMATION_SECRET",
    ],
    [
      'double-quoted import-meta env',
      'import.meta["env"].ADMIN_CONFIRMATION_SECRET',
    ],
    [
      'template import-meta env',
      'import.meta[`env`].ADMIN_CONFIRMATION_SECRET',
    ],
    [
      'parenthesized import-meta env',
      '(import.meta).env.ADMIN_CONFIRMATION_SECRET',
    ],
    [
      'optional parenthesized import-meta env',
      '(import.meta)?.env.ADMIN_CONFIRMATION_SECRET',
    ],
    [
      'parenthesized import-meta bracket env',
      "(import.meta)['env'].ADMIN_CONFIRMATION_SECRET",
    ],
    [
      'safe name through optional import-meta env',
      'import.meta?.env.VITE_SUPABASE_URL',
    ],
    [
      'safe name through bracket import-meta env',
      "import.meta['env'].VITE_SUPABASE_URL",
    ],
    [
      'safe name through parenthesized import-meta env',
      '(import.meta).env.VITE_SUPABASE_URL',
    ],
    [
      'comments between import-meta-env tokens',
      'import./* first */meta./* second */env.ADMIN_CONFIRMATION_SECRET',
    ],
    [
      'tabs and CRLF',
      'const runtimeEnv =\t(\r\n\timport.meta.env\r\n)\r\n',
    ],
  ]

  try {
    mkdirSync(clientDirectory, { recursive: true })
    spawnSync('git', ['init'], { cwd: directory, encoding: 'utf8' })

    for (const [label, fixture] of blocked) {
      writeFileSync(
        clientFile,
        `const sentinel = '${sentinel}'\n${fixture}\n`,
        'utf8',
      )
      const syntaxResult = spawnSync(
        process.execPath,
        ['--check', clientFile],
        { cwd: directory, encoding: 'utf8' },
      )
      assert.equal(
        syntaxResult.status,
        0,
        `${label} must remain syntactically valid`,
      )
      const result = spawnSync(
        process.execPath,
        [
          path.join(root, 'scripts', 'tooling', 'repository-checks.mjs'),
          'secrets',
        ],
        { cwd: directory, encoding: 'utf8' },
      )
      const output = `${result.stdout}${result.stderr}`
      assert.equal(result.status, 1, `${label} should fail the CLI`)
      assert.match(
        output,
        /(?:unapproved-browser-env-name|indirect-import-meta-env-access|client-process-env-access)/,
        `${label} should report a safe browser policy category`,
      )
      assert.doesNotMatch(output, new RegExp(sentinel))
      assert.doesNotMatch(
        output,
        new RegExp(fixture.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
      )
    }

    writeFileSync(
      clientFile,
      [
        'const url = import.meta.env.VITE_SUPABASE_URL',
        'const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY',
        '// import.meta.env.ADMIN_CONFIRMATION_SECRET',
        "const example = 'process.env.SUPABASE_SERVICE_ROLE_KEY'",
      ].join('\n'),
      'utf8',
    )
    const allowedResult = spawnSync(
      process.execPath,
      [
        path.join(root, 'scripts', 'tooling', 'repository-checks.mjs'),
        'secrets',
      ],
      { cwd: directory, encoding: 'utf8' },
    )
    const allowedSyntaxResult = spawnSync(
      process.execPath,
      ['--check', clientFile],
      { cwd: directory, encoding: 'utf8' },
    )
    assert.equal(allowedSyntaxResult.status, 0)
    assert.equal(
      allowedResult.status,
      0,
      `${allowedResult.stdout}${allowedResult.stderr}`,
    )
  } finally {
    rmSync(directory, { force: true, recursive: true })
  }
})

test('tool versions fail before work when Node or npm differs', () => {
  assert.deepEqual(
    validateToolVersions({
      nodeVersion: expectedNodeVersion,
      npmVersion: expectedNpmVersion,
    }),
    [],
  )
  assert.match(
    validateToolVersions({
      nodeVersion: '23.0.0',
      npmVersion: expectedNpmVersion,
    }).join('\n'),
    /Node version/,
  )
  assert.match(
    validateToolVersions({
      nodeVersion: expectedNodeVersion,
      npmVersion: '11.15.0',
    }).join('\n'),
    /npm version/,
  )
})

test('skill register, metadata, template, links, and MCP docs pass', () => {
  assert.deepEqual(checkGovernance(root), [])
})

test('skill register supports external and archived records without executable folders', () => {
  const register = readSkillRegister(
    readFileSync(path.join(root, 'docs', 'skills', 'README.md'), 'utf8'),
  )
  const directories = register.skills.map((skill) => skill.officialName)
  const source = register.skills[0]
  const external = {
    ...structuredClone(source),
    officialName: 'synthetic-personal-skill',
    scope: 'personal',
    pathOrSource: 'https://example.test/synthetic-personal-skill',
    status: 'active',
  }
  const archived = {
    ...structuredClone(source),
    officialName: 'synthetic-archived-skill',
    pathOrSource: 'archive:synthetic-archived-skill',
    status: 'archived',
  }
  const expanded = {
    ...structuredClone(register),
    skills: [...register.skills, external, archived],
  }
  assert.deepEqual(validateRegisterStructure(expanded, directories), [])

  assert.match(
    validateRegisterStructure(expanded, [
      ...directories,
      archived.officialName,
    ]).join('\n'),
    /archived skill must not retain a local executable folder/,
  )

  const deprecatedWithoutReplacement = {
    ...structuredClone(register),
    skills: register.skills.map((skill, index) =>
      index === 0 ? { ...skill, status: 'deprecated', replacement: null } : skill,
    ),
  }
  assert.match(
    validateRegisterStructure(
      deprecatedWithoutReplacement,
      directories,
    ).join('\n'),
    /deprecated skill must name a replacement/,
  )
})

test('skill forward fixtures retain trigger, non-trigger, stop, and fail-closed contracts', () => {
  const register = readSkillRegister(
    readFileSync(path.join(root, 'docs', 'skills', 'README.md'), 'utf8'),
  )
  assert.deepEqual(
    register.forwardTests.map(({ id, expectedSkill, expectedOutcome }) => ({
      id,
      expectedSkill,
      expectedOutcome,
    })),
    [
      {
        id: 'preflight-identity',
        expectedSkill: 'poster-valley-preflight',
        expectedOutcome: 'invoke',
      },
      {
        id: 'safe-change-write',
        expectedSkill: 'poster-valley-safe-change',
        expectedOutcome: 'invoke',
      },
      {
        id: 'safe-change-read-only-non-trigger',
        expectedSkill: null,
        expectedOutcome: 'do-not-invoke',
      },
      {
        id: 'release-readiness',
        expectedSkill: 'poster-valley-release-gate',
        expectedOutcome: 'invoke',
      },
      {
        id: 'release-write-stop',
        expectedSkill: 'poster-valley-release-gate',
        expectedOutcome: 'stop-no-authorization',
      },
      {
        id: 'database-write-stop',
        expectedSkill: 'poster-valley-release-gate',
        expectedOutcome: 'stop-no-authorization',
      },
      {
        id: 'missing-remote-access',
        expectedSkill: 'poster-valley-release-gate',
        expectedOutcome: 'not-verified',
      },
    ],
  )
})

test('GitHub Actions workflow is read-only and contains every required gate', () => {
  const workflow = readFileSync(
    path.join(root, '.github', 'workflows', 'quality.yml'),
    'utf8',
  )
  for (const required of [
    'pull_request:',
    'push:',
    'branches: [main]',
    'contents: read',
    'fetch-depth: 0',
    'node-version: 24.18.0',
    'npm install --global npm@11.16.0',
    'npm run check:versions',
    'git-diff-check.mjs --base',
    'npm ci',
    'npm run lint',
    'npm test',
    'npm run build',
    'npm run check:text',
    'npm run check:secrets',
    'npm run check:function-budget',
    'npm run check:governance',
    'npm audit --omit=dev',
  ]) {
    assert.match(
      workflow,
      new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    )
  }
  assert.match(workflow, /name: quality-gate/)
  assert.match(workflow, /name: production-dependency-audit/)
  assert.doesNotMatch(workflow, /\b(?:deploy|db push|apply_migration)\b/i)
  assert.doesNotMatch(workflow, /\$\{\{\s*secrets\./)
})
