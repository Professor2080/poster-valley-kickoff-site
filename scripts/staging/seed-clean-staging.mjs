import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  ORDER_FLOW_ACCEPTANCE_AFTER_CLEANUP_FLAG,
  assertDatabaseAuthInventory,
  assertExecutionContext,
  assertOwnerCapabilities,
  authInventorySql,
  buildLedger,
  loadFixtureDefinition,
  materializeFixtures,
  ownerCapabilitySql,
  orderFlowAcceptancePhase,
  parseFlags,
  printCounts,
  printScenarioMatrix,
  queryJson,
  readLedger,
  runLinkedQuery,
  scenarioMatrix,
  seedSql,
  snapshotSql,
  validateSnapshot,
  writeLedger,
} from './clean-staging-lib.mjs'

const help = `Usage: npm run staging:seed -- --confirm-clean-staging [${ORDER_FLOW_ACCEPTANCE_AFTER_CLEANUP_FLAG}]

Default mode seeds only an empty or ordinary fixture state and rejects runtime evidence.
${ORDER_FLOW_ACCEPTANCE_AFTER_CLEANUP_FLAG} first validates the exact retained post-cleanup Order Flow evidence, preserves it, seeds the fixture set, and verifies both.`

export async function runSeed({
  argv = process.argv.slice(2),
  env = process.env,
  output = console.log,
  sqlQuery = queryJson,
  sqlRun = runLinkedQuery,
  root = process.cwd(),
} = {}) {
  const flags = parseFlags(argv)
  if (flags.has('--help')) {
    output(help)
    return { help: true }
  }
  assertExecutionContext({ env, flags })
  const acceptancePhase = orderFlowAcceptancePhase(flags, {
    allowBeforeCleanup: false,
  })
  const capabilities = sqlQuery(ownerCapabilitySql(), { env, root })
  assertOwnerCapabilities(capabilities)

  const priorLedger = readLedger({ root })
  const allowedDeletedUserIds = (priorLedger?.records ?? [])
    .filter((record) => record.table === 'auth.users')
    .map((record) => record.id)
  const inventory = sqlQuery(authInventorySql(), { env, root })
  const { active: manager } = assertDatabaseAuthInventory(inventory, {
    allowedDeletedUserIds,
  })
  const definition = loadFixtureDefinition()
  const before = sqlQuery(snapshotSql(), { env, root })
  const beforeValidation = validateSnapshot(before, {
    acceptancePhase: acceptancePhase ?? 'before_cleanup',
    allowMissing: true,
    definition,
    expectOrderFlowAcceptance: acceptancePhase !== null,
    managerUserId: manager.id,
    requireManager: acceptancePhase !== null,
  })

  const rows = materializeFixtures(definition, manager.id)
  sqlRun(seedSql(rows, manager.id, { acceptance: beforeValidation.acceptance }), { env, root })

  const after = sqlQuery(snapshotSql(), { env, root })
  const verified = validateSnapshot(after, {
    acceptancePhase: acceptancePhase ?? 'before_cleanup',
    definition,
    expectOrderFlowAcceptance: acceptancePhase !== null,
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
  output('  Manager Auth user: existing confirmed fixture identity reused')
  output('  Operational email: suppressed; no login email sent by this script')
  printScenarioMatrix(scenarioMatrix(after, definition), output)
  printCounts('Retained append-only synthetic history', verified.retained, output)
  return { created: false, ledger, managerUserId: manager.id, snapshot: after }
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
