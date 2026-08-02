import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  CLEAN_STAGING_REF,
  EXECUTION_FLAG,
  FIXTURE_SET,
  assertExecutionContext,
  assertLedgerSafe,
  cleanupSql,
  ensureManagerUser,
  loadFixtureDefinition,
  materializeFixtures,
  runPsql,
  seedSql,
  sanitizedPsqlEnvironment,
  validateCleanupSnapshot,
  validateSnapshot,
} from '../scripts/staging/clean-staging-lib.mjs'
import { runCleanup } from '../scripts/staging/cleanup-clean-staging.mjs'
import { runSeed } from '../scripts/staging/seed-clean-staging.mjs'

const managerId = '50000000-0000-4000-8000-000000000001'
const managerEmail = 'manager@example.test'
const definition = loadFixtureDefinition()

function runtimeEnv(overrides = {}) {
  return {
    PATH: process.env.PATH,
    PATHEXT: process.env.PATHEXT,
    PGDATABASE: 'postgres',
    PGHOST: `db.${CLEAN_STAGING_REF}.supabase.co`,
    PGPASSWORD: 'synthetic-placeholder',
    PGPORT: '5432',
    PGSSLMODE: 'require',
    PGUSER: 'postgres',
    POSTER_VALLEY_ENV: 'clean-staging',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-test-key',
    SUPABASE_URL: `https://${CLEAN_STAGING_REF}.supabase.co`,
    ...overrides,
  }
}

function clone(value) {
  return structuredClone(value)
}

function baselineSnapshot(managerUserId = managerId) {
  const rows = materializeFixtures(definition, managerUserId)
  return {
    ...clone(rows),
    admin_operation_idempotency: [],
    admin_roles: [
      {
        granted_at: '2026-07-31T12:00:00.000Z',
        granted_by: null,
        revoked_at: null,
        role: 'manager',
        user_id: managerUserId,
      },
    ],
    manual_shipping_quotes: [],
    newsletter_signups: [],
    product_registry: [
      {
        commerce_authority: 'custom',
        lifecycle_mode: 'interest',
        product_code: 'eurofighter-typhoon-a2',
        title: 'Eurofighter Typhoon / A2',
        woo_product_id: null,
        woo_product_url: null,
      },
    ],
  }
}

function emptySnapshot() {
  const snapshot = baselineSnapshot()
  for (const table of [
    'admin_audit_events',
    'drop_interest_requests',
    'email_delivery_events',
    'entity_events',
    'operational_email_attempts',
    'order_invitations',
    'orders',
    'payments',
  ]) {
    snapshot[table] = []
  }
  snapshot.admin_roles = []
  return snapshot
}

function capabilities() {
  return {
    migration_count: 2,
    migration_total: 2,
    owner_capable: true,
    protected_triggers_enabled: true,
  }
}

function fakeAuth(initialUsers = []) {
  const state = { createCalls: 0, deleteCalls: [], users: clone(initialUsers) }
  return {
    state,
    async createUser(attributes) {
      state.createCalls += 1
      const user = {
        app_metadata: attributes.app_metadata,
        deleted_at: null,
        email: attributes.email,
        email_confirmed_at: '2026-07-31T12:00:00.000Z',
        id: managerId,
      }
      state.users.push(user)
      return { data: { user }, error: null }
    },
    async deleteUser(id, soft) {
      state.deleteCalls.push({ id, soft })
      const user = state.users.find((candidate) => candidate.id === id)
      if (user) user.deleted_at = '2026-08-01T12:00:00.000Z'
      return { data: {}, error: null }
    },
    async listUsers() {
      return { data: { users: clone(state.users) }, error: null }
    },
    async updateUserById(id) {
      const user = state.users.find((candidate) => candidate.id === id)
      user.email_confirmed_at = '2026-07-31T12:00:00.000Z'
      return { data: { user: clone(user) }, error: null }
    },
  }
}

function queryHarness(state) {
  return (sql) => (sql.includes("'owner_capable'") ? capabilities() : clone(state.snapshot))
}

function seedHarness(state, managerUserId = managerId) {
  return () => {
    const expected = materializeFixtures(definition, managerUserId)
    for (const [table, expectedRows] of Object.entries(expected)) {
      const existing = new Map(state.snapshot[table].map((row) => [row.id, row]))
      for (const row of expectedRows) {
        if (!existing.has(row.id)) state.snapshot[table].push(clone(row))
        else if (table === 'operational_email_attempts') {
          existing.get(row.id).interest_request_id = row.interest_request_id
        }
      }
    }
    state.snapshot.admin_roles = [
      { user_id: managerUserId, role: 'manager', granted_by: null, revoked_at: null },
    ]
  }
}

function cleanupHarness(state, { removeManagerRole = false } = {}) {
  return () => {
    const referenced = new Set(state.snapshot.email_delivery_events.map((event) => event.attempt_id))
    state.snapshot.operational_email_attempts = state.snapshot.operational_email_attempts.filter(
      (attempt) => referenced.has(attempt.id),
    )
    state.snapshot.payments = []
    state.snapshot.orders = []
    state.snapshot.order_invitations = []
    state.snapshot.drop_interest_requests = []
    for (const attempt of state.snapshot.operational_email_attempts) attempt.interest_request_id = null
    if (removeManagerRole) state.snapshot.admin_roles = []
  }
}

test('wrong project and missing environment variables are blocked', () => {
  assert.throws(
    () => assertExecutionContext({ env: runtimeEnv({ SUPABASE_URL: 'https://epqpeoubkbftcvxjbqeo.supabase.co' }), flags: new Set([EXECUTION_FLAG]) }),
    /exact Clean Staging|Production or Legacy/,
  )
  assert.throws(
    () => assertExecutionContext({ env: {}, flags: new Set([EXECUTION_FLAG]) }),
    /POSTER_VALLEY_ENV/,
  )
  assert.throws(
    () => assertExecutionContext({ env: runtimeEnv(), flags: new Set() }),
    /Explicit execution permission/,
  )
})

test('psql receives only connection and operating-system environment values', () => {
  const child = sanitizedPsqlEnvironment({
    ...runtimeEnv(),
    ADMIN_CONFIRMATION_SECRET: 'synthetic-placeholder',
    GH_TOKEN: 'synthetic-placeholder',
    RESEND_API_KEY: 'synthetic-placeholder',
  })
  assert.equal(child.PGPASSWORD, 'synthetic-placeholder')
  assert.equal(child.PGHOST, `db.${CLEAN_STAGING_REF}.supabase.co`)
  assert.equal(child.SUPABASE_SERVICE_ROLE_KEY, undefined)
  assert.equal(child.ADMIN_CONFIRMATION_SECRET, undefined)
  assert.equal(child.GH_TOKEN, undefined)
  assert.equal(child.RESEND_API_KEY, undefined)
})

test('owner SQL is sent on stdin and credentials never enter process arguments', () => {
  let invocation
  const output = runPsql('select 1;', {
    env: runtimeEnv(),
    psql: 'psql',
    spawn(program, args, options) {
      invocation = { args, options, program }
      return { status: 0, stdout: '1\n' }
    },
  })
  assert.equal(output, '1')
  assert.equal(invocation.options.input, 'select 1;')
  assert.equal(invocation.args.some((argument) => argument.includes('synthetic-placeholder')), false)
  assert.equal(invocation.options.env.SUPABASE_SERVICE_ROLE_KEY, undefined)
})

test('all fourteen scenarios satisfy fixture, schema and lifecycle contracts', () => {
  const snapshot = baselineSnapshot()
  const result = validateSnapshot(snapshot, { definition, managerUserId: managerId })
  assert.equal(definition.scenarios.length, 14)
  assert.deepEqual(result.retained, {
    admin_audit_events: 3,
    email_delivery_events: 3,
    entity_events: 3,
    operational_email_attempts: 3,
  })
})

test('seed is idempotent and append-only rows do not grow on a second run', async (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'pv-clean-staging-seed-'))
  t.after(() => rmSync(root, { force: true, recursive: true }))
  const state = { snapshot: emptySnapshot() }
  const auth = fakeAuth()
  const options = {
    argv: [EXECUTION_FLAG],
    authAdmin: auth,
    env: runtimeEnv(),
    output: () => {},
    prompt: async () => managerEmail,
    psqlQuery: queryHarness(state),
    psqlRun: seedHarness(state),
    root,
  }
  await runSeed(options)
  const firstCounts = Object.fromEntries(
    ['admin_audit_events', 'email_delivery_events', 'entity_events'].map((table) => [table, state.snapshot[table].length]),
  )
  await runSeed(options)
  const secondCounts = Object.fromEntries(
    Object.keys(firstCounts).map((table) => [table, state.snapshot[table].length]),
  )
  assert.deepEqual(secondCounts, firstCounts)
  assert.equal(auth.state.createCalls, 1)
  assert.equal(state.snapshot.admin_roles.length, 1)
  const ledgerText = readFileSync(path.join(root, '.tmp/clean-staging-seed-ledger.json'), 'utf8')
  assert.doesNotMatch(ledgerText, /@|manager@example|synthetic-placeholder|service-role-test-key/)
  assertLedgerSafe(JSON.parse(ledgerText))
})

test('cleanup dry-run changes nothing', async () => {
  const state = { snapshot: baselineSnapshot() }
  const before = clone(state.snapshot)
  const auth = fakeAuth([{ id: managerId, email: managerEmail, email_confirmed_at: 'now', deleted_at: null, app_metadata: { fixture_set: FIXTURE_SET } }])
  let writes = 0
  const result = await runCleanup({
    argv: [EXECUTION_FLAG],
    authAdmin: auth,
    env: runtimeEnv(),
    output: () => {},
    psqlQuery: queryHarness(state),
    psqlRun: () => { writes += 1 },
  })
  assert.equal(result.dryRun, true)
  assert.equal(writes, 0)
  assert.deepEqual(state.snapshot, before)
})

test('limited cleanup removes only mutable fixtures and retains append-only history', async () => {
  const state = { snapshot: baselineSnapshot() }
  const auth = fakeAuth([{ id: managerId, email: managerEmail, email_confirmed_at: 'now', deleted_at: null, app_metadata: { fixture_set: FIXTURE_SET } }])
  await runCleanup({
    argv: [EXECUTION_FLAG, '--confirm'],
    authAdmin: auth,
    env: runtimeEnv(),
    output: () => {},
    psqlQuery: queryHarness(state),
    psqlRun: cleanupHarness(state),
  })
  assert.equal(state.snapshot.drop_interest_requests.length, 0)
  assert.equal(state.snapshot.orders.length, 0)
  assert.equal(state.snapshot.operational_email_attempts.length, 3)
  assert.equal(state.snapshot.admin_audit_events.length, 3)
  assert.equal(state.snapshot.email_delivery_events.length, 3)
  assert.equal(state.snapshot.entity_events.length, 3)
  validateCleanupSnapshot(state.snapshot, { definition, managerUserId: managerId })
})

test('non-marked or unexpected records are never cleaned', async () => {
  const state = { snapshot: baselineSnapshot() }
  state.snapshot.drop_interest_requests.push({
    ...state.snapshot.drop_interest_requests[0],
    id: '51000000-0000-4000-8000-000000000099',
    metadata: {},
  })
  const auth = fakeAuth([{ id: managerId, email: managerEmail, email_confirmed_at: 'now', deleted_at: null, app_metadata: { fixture_set: FIXTURE_SET } }])
  let writes = 0
  await assert.rejects(
    runCleanup({
      argv: [EXECUTION_FLAG, '--confirm'],
      authAdmin: auth,
      env: runtimeEnv(),
      output: () => {},
      psqlQuery: queryHarness(state),
      psqlRun: () => { writes += 1 },
    }),
    /Unexpected drop_interest_requests/,
  )
  assert.equal(writes, 0)
})

test('manager bootstrap creates once and safely reuses the same confirmed user', async () => {
  const auth = fakeAuth()
  const created = await ensureManagerUser({ authAdmin: auth, email: managerEmail, users: [] })
  const reused = await ensureManagerUser({ authAdmin: auth, email: managerEmail, users: auth.state.users })
  assert.equal(created.created, true)
  assert.equal(reused.created, false)
  assert.equal(created.manager.id, reused.manager.id)
  assert.equal(auth.state.createCalls, 1)
})

test('manager bootstrap blocks a second active Auth identity', async () => {
  const auth = fakeAuth([
    { id: managerId, email: managerEmail, email_confirmed_at: 'now', deleted_at: null, app_metadata: {} },
    { id: '50000000-0000-4000-8000-000000000002', email: 'second@example.test', email_confirmed_at: 'now', deleted_at: null, app_metadata: {} },
  ])
  await assert.rejects(
    ensureManagerUser({ authAdmin: auth, email: managerEmail, users: auth.state.users }),
    /Unexpected Auth user or duplicate manager identity/,
  )
})

test('manager Auth soft-delete requires both explicit cleanup flags', async () => {
  const user = { id: managerId, email: managerEmail, email_confirmed_at: 'now', deleted_at: null, app_metadata: { fixture_set: FIXTURE_SET } }
  const auth = fakeAuth([user])
  const state = { snapshot: baselineSnapshot() }
  await assert.rejects(
    runCleanup({
      argv: [EXECUTION_FLAG, '--confirm', '--remove-manager-user'],
      authAdmin: auth,
      env: runtimeEnv(),
      output: () => {},
      psqlQuery: queryHarness(state),
      psqlRun: cleanupHarness(state),
    }),
    /also requires --remove-manager-role/,
  )
  assert.equal(auth.state.deleteCalls.length, 0)

  await runCleanup({
    argv: [EXECUTION_FLAG, '--confirm', '--remove-manager-role', '--remove-manager-user'],
    authAdmin: auth,
    env: runtimeEnv(),
    output: () => {},
    psqlQuery: queryHarness(state),
    psqlRun: cleanupHarness(state, { removeManagerRole: true }),
  })
  assert.deepEqual(auth.state.deleteCalls, [{ id: managerId, soft: true }])
})

test('generated SQL never changes schema, grants or append-only triggers', () => {
  const rows = materializeFixtures(definition, managerId)
  const seed = seedSql(rows, managerId)
  const cleanup = cleanupSql(rows, managerId, { removeManagerRole: true })
  assert.doesNotMatch(seed, /(?:^|\n)\s*(?:alter|create|drop|grant|revoke)\s/i)
  assert.doesNotMatch(cleanup, /session_replication_role|disable\s+trigger/i)
  for (const table of ['admin_audit_events', 'email_delivery_events', 'entity_events']) {
    assert.doesNotMatch(cleanup, new RegExp(`delete\\s+from\\s+public\\.${table}`, 'i'))
  }
})
