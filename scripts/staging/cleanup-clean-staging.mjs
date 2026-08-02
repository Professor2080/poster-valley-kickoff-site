import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  assertAuthInventory,
  assertExecutionContext,
  assertOwnerCapabilities,
  cleanupPlan,
  cleanupSql,
  createAuthAdmin,
  listAllAuthUsers,
  loadFixtureDefinition,
  materializeFixtures,
  ownerCapabilitySql,
  parseFlags,
  printCounts,
  queryJson,
  readLedger,
  resolveOwnerEnvironment,
  runPsql,
  snapshotSql,
  softDeleteManagerUser,
  validateCleanupSnapshot,
  validateSnapshot,
} from './clean-staging-lib.mjs'

export async function runCleanup({
  argv = process.argv.slice(2),
  authAdmin = null,
  env = process.env,
  output = console.log,
  prompt,
  psqlQuery = queryJson,
  psqlRun = runPsql,
  root = process.cwd(),
} = {}) {
  const flags = parseFlags(argv)
  assertExecutionContext({ env, flags })
  const confirmed = flags.has('--confirm')
  const removeManagerRole = flags.has('--remove-manager-role')
  const removeManagerUser = flags.has('--remove-manager-user')
  if (removeManagerUser && !removeManagerRole) {
    throw new Error('--remove-manager-user also requires --remove-manager-role.')
  }

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
  const managerUserId = active[0]?.id ?? ledger?.manager_user_id
  if (!managerUserId) throw new Error('Manager user id is unavailable; cleanup stopped.')
  if (
    removeManagerUser &&
    active[0]?.app_metadata?.fixture_set !== 'PV-CLEAN-STAGING-V1'
  ) {
    throw new Error('A reused non-fixture manager Auth user cannot be removed.')
  }

  const definition = loadFixtureDefinition()
  const rows = materializeFixtures(definition, managerUserId)
  const before = psqlQuery(snapshotSql(), { env: ownerEnv })
  validateSnapshot(before, {
    allowMissing: true,
    definition,
    managerUserId,
    requireManager: false,
  })
  const plan = cleanupPlan(before, { removeManagerRole, removeManagerUser })
  const managerRoleExpected =
    !removeManagerRole &&
    before.admin_roles.some(
      (row) => row.user_id === managerUserId && row.role === 'manager' && row.revoked_at === null,
    )
  output(`Clean Staging limited cleanup ${confirmed ? 'confirmed plan' : 'DRY RUN'}`)
  printCounts('Mutable fixture rows selected', plan.delete, output)
  printCounts('Retained append-only synthetic history', plan.retained_append_only_history, output)
  output(`  Manager role: ${plan.manager_role}`)
  output(`  Manager Auth user: ${plan.manager_user}`)
  if (!confirmed) return { dryRun: true, plan, snapshot: before }

  psqlRun(cleanupSql(rows, managerUserId, { removeManagerRole }), { env: ownerEnv })
  const after = psqlQuery(snapshotSql(), { env: ownerEnv })
  const verified = validateCleanupSnapshot(after, {
    definition,
    managerRoleExpected,
    managerUserId,
  })
  if (removeManagerUser && active[0]) {
    await softDeleteManagerUser({
      authAdmin: admin,
      managerUserId,
      users,
    })
  }
  output(`PASS ${definition.fixture_set} limited cleanup completed.`)
  printCounts('Retained append-only synthetic history', verified.retained, output)
  return { dryRun: false, plan, snapshot: after, verified }
}

const isMain =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href ===
    pathToFileURL(fileURLToPath(import.meta.url)).href

if (isMain) {
  runCleanup().catch((error) => {
    console.error(`FAIL Clean Staging cleanup: ${error.message}`)
    process.exitCode = 1
  })
}
