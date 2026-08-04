import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

const windowsTest = process.platform === 'win32' ? test : test.skip

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const verifier = path.join(repositoryRoot, 'scripts', 'verify-preview.ps1')
const powershell = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
const expectedBranch = 'codex/preview-verification-contract'
const expectedSha = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const expectedProject = 'poster-valley'
const expectedRepository = 'Professor2080/poster-valley-kickoff-site'
const previewHost = 'poster-valley-kickoff-site-a1b2c3.vercel.app'
const branchAliasHost = 'poster-valley-kickoff-site-git-codex-preview.vercel.app'

function baseScenario() {
  const deployment = {
      id: 'dpl_preview_fixture',
      name: expectedProject,
      url: previewHost,
      target: null,
      readyState: 'READY',
      builds: [{
        output: Array.from({ length: 12 }, (_, index) => ({ type: 'lambda', path: `api/function-${index + 1}.js` })),
      }],
    }
  return {
    deployment,
    sourceDeployment: {
      id: deployment.id,
      name: deployment.name,
      url: deployment.url,
      target: deployment.target,
      state: deployment.readyState,
      meta: {
        githubCommitSha: expectedSha,
        githubCommitRef: expectedBranch,
        githubCommitOrg: 'Professor2080',
        githubCommitRepo: 'poster-valley-kickoff-site',
      },
    },
    aliasDeployment: {
      id: 'dpl_preview_fixture',
      name: expectedProject,
      url: previewHost,
      target: null,
      readyState: 'READY',
    },
    routes: {
      '/': 200,
      '/privacy': 200,
      '/terms': 200,
      '/admin': 200,
      '/api/admin/authorization': 401,
      '/api/admin/delivery-status': 401,
    },
  }
}

const mockDriver = String.raw`
import { readFileSync } from 'node:fs'

const scenario = JSON.parse(readFileSync(process.env.PV_PREVIEW_SCENARIO, 'utf8'))
const args = process.argv.slice(2)

if (scenario.cliError) {
  process.stderr.write(scenario.cliError)
  process.exit(1)
}

if (args[0] === 'inspect') {
  const target = String(args[1] ?? '').replace(/^https?:\/\//, '').replace(/\/$/, '')
  const payload = target === process.env.PV_PREVIEW_BRANCH_ALIAS
    ? scenario.aliasDeployment
    : scenario.deployment
  process.stdout.write(JSON.stringify(payload))
  process.exit(0)
}

if (args[0] === 'list') {
  process.stdout.write(JSON.stringify({ deployments: [scenario.sourceDeployment], pagination: { count: 1 } }))
  process.exit(0)
}

if (args[0] === 'curl') {
  const route = args[1]
  const status = scenario.routes?.[route]
  if (status === undefined) {
    process.stderr.write('mock route missing')
    process.exit(1)
  }
  process.stdout.write(String(status))
  process.exit(0)
}

process.stderr.write('unsupported mock command')
process.exit(1)
`

async function runVerifier(mutate = () => {}, options = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'poster-valley-preview-verifier-'))
  const bin = path.join(root, 'bin')
  await mkdir(bin)
  const scenario = baseScenario()
  mutate(scenario)
  const scenarioPath = path.join(root, 'scenario.json')
  await writeFile(scenarioPath, JSON.stringify(scenario), 'utf8')
  await writeFile(path.join(root, 'repository.json'), JSON.stringify({
    root: repositoryRoot,
    branch: expectedBranch,
    head: expectedSha,
    origin: `https://github.com/${expectedRepository}.git`,
    remoteSha: expectedSha,
    clean: true,
  }), 'utf8')
  await writeFile(path.join(bin, 'vercel-mock.mjs'), mockDriver, 'utf8')
  await writeFile(path.join(bin, 'vercel.cmd'), '@echo off\r\nnode "%~dp0vercel-mock.mjs" %*\r\n', 'utf8')
  await writeFile(path.join(bin, 'vercel.ps1'), "throw 'the PowerShell wrapper must never execute'\r\n", 'utf8')

  const args = [
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', verifier,
    '-ExpectedBranch', expectedBranch,
    '-ExpectedSha', options.expectedSha ?? expectedSha,
    '-PreviewUrl', `https://${previewHost}`,
    '-ExpectedVercelProject', expectedProject,
    '-ExpectedRepository', expectedRepository,
    '-FixtureDirectory', root,
    '-VercelCommandName', options.vercelCommandName ?? 'vercel',
  ]
  if (options.branchAlias !== false) args.push('-BranchAlias', branchAliasHost)
  if (options.deploymentId) args.push('-DeploymentId', options.deploymentId)

  const result = spawnSync(powershell, args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${bin}${path.delimiter}${process.env.PATH ?? ''}`,
      PV_PREVIEW_TEST_MODE: '1',
      PV_PREVIEW_SCENARIO: scenarioPath,
      PV_PREVIEW_BRANCH_ALIAS: branchAliasHost,
    },
  })
  await rm(root, { recursive: true, force: true })
  return { ...result, output: `${result.stdout ?? ''}${result.stderr ?? ''}` }
}

windowsTest('Preview verification passes the complete mocked happy path', async () => {
  const result = await runVerifier()
  assert.equal(result.status, 0, result.output)
  assert.match(result.output, /PREVIEW VERIFICATION PASS/)
  assert.match(result.output, /\[PASS\] deployed function budget - 12 of 12 functions/)
})

test('npm exposes the PowerShell verifier as the single Preview entrypoint', async () => {
  const packageJson = JSON.parse(await readFile(path.join(repositoryRoot, 'package.json'), 'utf8'))
  assert.equal(
    packageJson.scripts['verify:preview'],
    'powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-preview.ps1',
  )
})

windowsTest('Preview verification rejects a deployment from the wrong SHA', async () => {
  const result = await runVerifier((scenario) => { scenario.sourceDeployment.meta.githubCommitSha = 'b'.repeat(40) })
  assert.equal(result.status, 1)
  assert.match(result.output, /\[FAIL\] deployment SHA/)
})

windowsTest('Preview verification rejects a deployment from the wrong branch', async () => {
  const result = await runVerifier((scenario) => { scenario.sourceDeployment.meta.githubCommitRef = 'codex/another-branch' })
  assert.equal(result.status, 1)
  assert.match(result.output, /\[FAIL\] deployment branch/)
})

windowsTest('Preview verification never accepts a Production deployment', async () => {
  const result = await runVerifier((scenario) => { scenario.deployment.target = 'production' })
  assert.equal(result.status, 1)
  assert.match(result.output, /\[FAIL\] Preview environment - Production is never an accepted verification target/)
})

windowsTest('Preview verification rejects a deployment that is not READY', async () => {
  const result = await runVerifier((scenario) => { scenario.deployment.readyState = 'BUILDING' })
  assert.equal(result.status, 1)
  assert.match(result.output, /\[FAIL\] deployment readiness/)
})

windowsTest('Preview verification rejects a branch alias that targets another deployment', async () => {
  const result = await runVerifier((scenario) => { scenario.aliasDeployment.id = 'dpl_another_fixture'; scenario.aliasDeployment.url = 'another.vercel.app' })
  assert.equal(result.status, 1)
  assert.match(result.output, /\[FAIL\] branch alias target/)
})

windowsTest('Preview verification rejects more than twelve deployed functions', async () => {
  const result = await runVerifier((scenario) => {
    scenario.deployment.builds[0].output.push({ type: 'lambda', path: 'api/function-13.js' })
  })
  assert.equal(result.status, 1)
  assert.match(result.output, /13 exceeds maximum 12/)
})

windowsTest('Preview verification rejects a missing required public route', async () => {
  const result = await runVerifier((scenario) => { scenario.routes['/privacy'] = 404 })
  assert.equal(result.status, 1)
  assert.match(result.output, /\[FAIL\] public route \/privacy - HTTP 404/)
})

windowsTest('Preview verification reports a missing Vercel CLI without exposing provider state', async () => {
  const result = await runVerifier(() => {}, { vercelCommandName: 'vercel-missing-fixture' })
  assert.equal(result.status, 1)
  assert.match(result.output, /\[FAIL\] Vercel CLI application shim/)
  assert.doesNotMatch(result.output, /AppData|\.vercel\\auth|credentials/i)
})

windowsTest('Preview verification resolves vercel.cmd instead of a PowerShell wrapper', async () => {
  const result = await runVerifier()
  assert.equal(result.status, 0, result.output)
  assert.match(result.output, /\[PASS\] Vercel CLI application shim - vercel\.cmd/)
  assert.doesNotMatch(result.output, /PowerShell wrapper must never execute/i)
})

windowsTest('Preview verification redacts credential-shaped CLI failures', async () => {
  const redactionCanary = 'vercel_abcdefghijkl'
  const connectionCanary = ['postgresql://', 'fixture:password', '@database.example.test/postgres'].join('')
  const result = await runVerifier((scenario) => {
    scenario.cliError = `authentication failed token=${redactionCanary} source=${connectionCanary}`
  })
  assert.equal(result.status, 1)
  assert.match(result.output, /\[REDACTED\]/)
  assert.match(result.output, /\[REDACTED_CONNECTION_STRING\]/)
  assert.doesNotMatch(result.output, new RegExp(redactionCanary))
  assert.doesNotMatch(result.output, /fixture:password/)
})
