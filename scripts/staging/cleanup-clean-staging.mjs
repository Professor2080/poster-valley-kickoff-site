import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  ORDER_FLOW_ACCEPTANCE_AFTER_CLEANUP_FLAG,
  ORDER_FLOW_ACCEPTANCE_FLAG,
  assertAuthInventory,
  assertDatabaseAuthInventory,
  assertExecutionContext,
  assertOwnerCapabilities,
  authInventorySql,
  cleanupPlan,
  cleanupSql,
  createAuthAdmin,
  listAllAuthUsers,
  loadFixtureDefinition,
  materializeFixtures,
  ownerCapabilitySql,
  orderFlowAcceptancePhase,
  parseFlags,
  printCounts,
  queryJson,
  readLedger,
  runLinkedQuery,
  snapshotSql,
  softDeleteManagerUser,
  validateCleanupSnapshot,
  validateSnapshot,
} from './clean-staging-lib.mjs'

const help = `Usage: npm run staging:cleanup -- --confirm-clean-staging [--confirm] [acceptance phase]

Acceptance phases (choose at most one):
  ${ORDER_FLOW_ACCEPTANCE_FLAG}
    Validate the exact pre-cleanup acceptance chain, including mutable Board work and parents.
  ${ORDER_FLOW_ACCEPTANCE_AFTER_CLEANUP_FLAG}
    Validate the exact retained post-cleanup chain; mutable Board work is absent and the attempt parent is null.

Without an acceptance phase, every runtime-created record remains a fail-closed blocker.`

export async function runCleanup({
  argv = process.argv.slice(2),
  authAdmin = null,
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
  const confirmed = flags.has('--confirm')
  const removeManagerRole = flags.has('--remove-manager-role')
  const removeManagerUser = flags.has('--remove-manager-user')
  const acceptancePhase = orderFlowAcceptancePhase(flags)
  const expectOrderFlowAcceptance = acceptancePhase !== null
  if (removeManagerUser && !removeManagerRole) {
    throw new Error('--remove-manager-user also requires --remove-manager-role.')
  }

  const capabilities = sqlQuery(ownerCapabilitySql(), { env, root })
  assertOwnerCapabilities(capabilities)
  const ledger = readLedger({ root })
  const allowedDeletedUserIds = (ledger?.records ?? [])
    .filter((record) => record.table === 'auth.users')
    .map((record) => record.id)
  const inventory = sqlQuery(authInventorySql(), { env, root })
  const { active } = assertDatabaseAuthInventory(inventory, { allowedDeletedUserIds })
  const managerUserId = active.id
  let admin = null
  let users = null
  if (removeManagerUser) {
    if (!env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY is required only for Auth user removal.')
    }
    admin = authAdmin ?? createAuthAdmin(env)
    users = await listAllAuthUsers(admin)
    const adminInventory = assertAuthInventory(users, { allowedDeletedUserIds })
    if (
      adminInventory.active.length !== 1 ||
      adminInventory.active[0].id !== managerUserId ||
      adminInventory.active[0]?.app_metadata?.fixture_set !== 'PV-CLEAN-STAGING-V1'
    ) {
      throw new Error('Only the exact fixture-owned manager Auth user can be removed.')
    }
  }

  const definition = loadFixtureDefinition()
  const rows = materializeFixtures(definition, managerUserId)
  const before = sqlQuery(snapshotSql(), { env, root })
  const validated = validateSnapshot(before, {
    acceptancePhase: acceptancePhase ?? 'before_cleanup',
    allowMissing: true,
    definition,
    expectOrderFlowAcceptance,
    managerUserId,
    requireManager: expectOrderFlowAcceptance,
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

  sqlRun(
    cleanupSql(rows, managerUserId, {
      acceptance: validated.acceptance,
      removeManagerRole,
    }),
    { env, root },
  )
  const after = sqlQuery(snapshotSql(), { env, root })
  const verified = validateCleanupSnapshot(after, {
    definition,
    expectOrderFlowAcceptance,
    managerRoleExpected,
    managerUserId,
  })
  if (removeManagerUser) {
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
