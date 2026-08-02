import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  assertAuthInventory,
  assertExecutionContext,
  assertOwnerCapabilities,
  createAuthAdmin,
  listAllAuthUsers,
  loadFixtureDefinition,
  ownerCapabilitySql,
  parseFlags,
  printCounts,
  printScenarioMatrix,
  queryJson,
  readLedger,
  resolveOwnerEnvironment,
  scenarioMatrix,
  snapshotSql,
  validateSnapshot,
} from './clean-staging-lib.mjs'

export async function runVerify({
  argv = process.argv.slice(2),
  authAdmin = null,
  env = process.env,
  output = console.log,
  prompt,
  psqlQuery = queryJson,
  root = process.cwd(),
} = {}) {
  const flags = parseFlags(argv)
  assertExecutionContext({ env, flags })
  const ownerEnv = await resolveOwnerEnvironment({ env, prompt })
  const capabilities = psqlQuery(ownerCapabilitySql(), { env: ownerEnv })
  assertOwnerCapabilities(capabilities)

  const admin = authAdmin ?? createAuthAdmin(env)
  const users = await listAllAuthUsers(admin)
  const ledger = readLedger({ root })
  const allowedDeletedUserIds = (ledger?.records ?? [])
    .filter((record) => record.table === 'auth.users')
    .map((record) => record.id)
  const { active } = assertAuthInventory(users, { allowedDeletedUserIds })
  if (active.length !== 1) throw new Error('Exactly one active manager Auth user is required.')

  const definition = loadFixtureDefinition()
  const snapshot = psqlQuery(snapshotSql(), { env: ownerEnv })
  const verified = validateSnapshot(snapshot, {
    definition,
    managerUserId: active[0].id,
  })
  output(`PASS ${definition.fixture_set} verified.`)
  printScenarioMatrix(scenarioMatrix(snapshot, definition), output)
  printCounts('Retained append-only synthetic history', verified.retained, output)
  return { managerUserId: active[0].id, snapshot, verified }
}

const isMain =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href ===
    pathToFileURL(fileURLToPath(import.meta.url)).href

if (isMain) {
  runVerify().catch((error) => {
    console.error(`FAIL Clean Staging verification: ${error.message}`)
    process.exitCode = 1
  })
}
