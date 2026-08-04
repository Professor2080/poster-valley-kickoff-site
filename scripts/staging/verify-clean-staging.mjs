import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  assertDatabaseAuthInventory,
  assertExecutionContext,
  assertOwnerCapabilities,
  authInventorySql,
  loadFixtureDefinition,
  ownerCapabilitySql,
  parseFlags,
  printCounts,
  printScenarioMatrix,
  queryJson,
  readLedger,
  scenarioMatrix,
  snapshotSql,
  validateSnapshot,
} from './clean-staging-lib.mjs'

export async function runVerify({
  argv = process.argv.slice(2),
  env = process.env,
  output = console.log,
  sqlQuery = queryJson,
  root = process.cwd(),
} = {}) {
  const flags = parseFlags(argv)
  assertExecutionContext({ env, flags })
  const capabilities = sqlQuery(ownerCapabilitySql(), { env, root })
  assertOwnerCapabilities(capabilities)

  const ledger = readLedger({ root })
  const allowedDeletedUserIds = (ledger?.records ?? [])
    .filter((record) => record.table === 'auth.users')
    .map((record) => record.id)
  const inventory = sqlQuery(authInventorySql(), { env, root })
  const { active } = assertDatabaseAuthInventory(inventory, { allowedDeletedUserIds })

  const definition = loadFixtureDefinition()
  const snapshot = sqlQuery(snapshotSql(), { env, root })
  const verified = validateSnapshot(snapshot, {
    definition,
    managerUserId: active.id,
  })
  output(`PASS ${definition.fixture_set} verified.`)
  printScenarioMatrix(scenarioMatrix(snapshot, definition), output)
  printCounts('Retained append-only synthetic history', verified.retained, output)
  return { managerUserId: active.id, snapshot, verified }
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
