import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  assertAuthInventory,
  assertExecutionContext,
  assertOwnerCapabilities,
  buildLedger,
  createAuthAdmin,
  ensureManagerUser,
  hiddenPrompt,
  listAllAuthUsers,
  loadFixtureDefinition,
  materializeFixtures,
  ownerCapabilitySql,
  parseFlags,
  printCounts,
  printScenarioMatrix,
  queryJson,
  readLedger,
  resolveOwnerEnvironment,
  runPsql,
  scenarioMatrix,
  seedSql,
  snapshotSql,
  validateSnapshot,
  writeLedger,
} from './clean-staging-lib.mjs'

const placeholderManagerId = '50000000-0000-4000-8000-000000000000'

export async function runSeed({
  argv = process.argv.slice(2),
  authAdmin = null,
  env = process.env,
  output = console.log,
  prompt = hiddenPrompt,
  psqlQuery = queryJson,
  psqlRun = null,
  root = process.cwd(),
} = {}) {
  const flags = parseFlags(argv)
  assertExecutionContext({ env, flags })
  const ownerEnv = await resolveOwnerEnvironment({ env, prompt })
  const capabilities = psqlQuery(ownerCapabilitySql(), { env: ownerEnv })
  assertOwnerCapabilities(capabilities)

  const admin = authAdmin ?? createAuthAdmin(env)
  const managerEmail = await prompt('Clean Staging manager email: ')
  const users = await listAllAuthUsers(admin)
  const priorLedger = readLedger({ root })
  const allowedDeletedUserIds = (priorLedger?.records ?? [])
    .filter((record) => record.table === 'auth.users')
    .map((record) => record.id)
  const inventory = assertAuthInventory(users, {
    allowedDeletedUserIds,
    managerEmail,
  })
  const existingManagerId = inventory.matches[0]?.id ?? null
  const definition = loadFixtureDefinition()
  const before = psqlQuery(snapshotSql(), { env: ownerEnv })
  validateSnapshot(before, {
    allowMissing: true,
    definition,
    managerUserId: existingManagerId ?? placeholderManagerId,
    requireManager: false,
  })

  const { created, manager } = await ensureManagerUser({
    authAdmin: admin,
    email: managerEmail,
    users,
  })
  const rows = materializeFixtures(definition, manager.id)
  const executeSql = psqlRun ?? runPsql
  executeSql(seedSql(rows, manager.id), { env: ownerEnv })

  const after = psqlQuery(snapshotSql(), { env: ownerEnv })
  const verified = validateSnapshot(after, {
    definition,
    managerUserId: manager.id,
  })
  const ledger = buildLedger({
    definition,
    managerUserId: manager.id,
    rows,
    snapshot: after,
  })
  writeLedger(ledger, { root })

  output(`PASS ${definition.fixture_set} seeded idempotently.`)
  output(`  Manager Auth user: ${created ? 'created and confirmed' : 'reused and confirmed'}`)
  output('  Operational email: suppressed; no login email sent by this script')
  printScenarioMatrix(scenarioMatrix(after, definition), output)
  printCounts('Retained append-only synthetic history', verified.retained, output)
  return { created, ledger, managerUserId: manager.id, snapshot: after }
}

const isMain =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href ===
    pathToFileURL(fileURLToPath(import.meta.url)).href

if (isMain) {
  runSeed().catch((error) => {
    console.error(`FAIL Clean Staging seed: ${error.message}`)
    process.exitCode = 1
  })
}
