import assert from 'node:assert/strict'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  CLEAN_STAGING_REF,
  EXECUTION_FLAG,
  FIXTURE_SET,
  ORDER_FLOW_ACCEPTANCE_FLAG,
  assertDatabaseAuthInventory,
  assertExecutionContext,
  assertLinkedCleanStagingProject,
  assertLedgerSafe,
  cleanupPlan,
  cleanupSql,
  ensureManagerUser,
  loadFixtureDefinition,
  materializeFixtures,
  queryJson,
  runLinkedQuery,
  seedSql,
  sanitizedSupabaseCliEnvironment,
  validateCleanupSnapshot,
  validateOrderFlowAcceptanceEvidence,
  validateSnapshot,
} from '../scripts/staging/clean-staging-lib.mjs'
import { runCleanup } from '../scripts/staging/cleanup-clean-staging.mjs'
import { runSeed } from '../scripts/staging/seed-clean-staging.mjs'
import { runVerify } from '../scripts/staging/verify-clean-staging.mjs'

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
    current_user: 'postgres',
    database: 'postgres',
    migration_count: 6,
    migration_total: 6,
    owner_capable: true,
    protected_triggers_enabled: true,
    session_user: 'postgres',
    transaction_read_only: true,
  }
}

function databaseAuthInventory(managerUserId = managerId) {
  return {
    active_users: [
      { confirmed: true, fixture_owned: true, id: managerUserId },
    ],
    deleted_user_ids: [],
  }
}

function linkedCliRoot(t, projectRef = CLEAN_STAGING_REF) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'pv-clean-staging-cli-root-'))
  const temporaryRoot = mkdtempSync(path.join(os.tmpdir(), 'pv-clean-staging-cli-temp-'))
  t.after(() => rmSync(root, { force: true, recursive: true }))
  t.after(() => rmSync(temporaryRoot, { force: true, recursive: true }))
  mkdirSync(path.join(root, 'supabase/.temp'), { recursive: true })
  mkdirSync(path.join(root, 'node_modules/supabase/dist'), { recursive: true })
  writeFileSync(path.join(root, 'supabase/.temp/project-ref'), projectRef)
  writeFileSync(path.join(root, 'node_modules/supabase/dist/supabase.js'), '')
  return { root, temporaryRoot }
}

function fakeAuth(initialUsers = []) {
  const state = { createCalls: 0, deleteCalls: [], listCalls: 0, users: clone(initialUsers) }
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
      state.listCalls += 1
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
  return (sql) => {
    if (sql.includes("'owner_capable'")) return capabilities()
    if (sql.includes("'active_users'")) return databaseAuthInventory()
    return clone(state.snapshot)
  }
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
    state.snapshot.admin_operation_idempotency = []
    state.snapshot.admin_order_flow_state = []
    for (const attempt of state.snapshot.operational_email_attempts) attempt.interest_request_id = null
    if (removeManagerRole) state.snapshot.admin_roles = []
  }
}

function acceptanceSnapshot() {
  const snapshot = baselineSnapshot()
  const scenario01 = definition.scenarios.find((scenario) => scenario.number === 1)
  const scenario10 = definition.scenarios.find((scenario) => scenario.number === 10)
  const scenario16 = definition.scenarios.find((scenario) => scenario.number === 16)
  const attemptId = '56000000-0000-4000-8000-000000000001'
  const eventId = '56000000-0000-4000-8000-000000000002'
  const keys = {
    process: 'acceptance-board-process-01',
    delivery: 'acceptance-delivery-confirm-10',
    close: 'acceptance-board-close-10',
    invitation: 'acceptance-invitation-send-16',
  }
  snapshot.operational_email_attempts.push({
    id: attemptId,
    actor_user_id: managerId,
    action: 'invitation.send',
    idempotency_key: keys.invitation,
    template: 'order_invitation',
    template_version: 'v1',
    entity_type: 'order_invitation',
    entity_id: scenario16.ids.invitation,
    token_hash: 'a'.repeat(64),
    expires_at: '2099-12-31T23:59:59.000Z',
    delivery_status: 'suppressed',
    provider_id: null,
    dispatch_claim_id: '56000000-0000-4000-8000-000000000011',
    dispatch_lease_expires_at: null,
    dispatch_started_at: '2026-08-04T12:00:00.000Z',
    completed_at: '2026-08-04T12:00:01.000Z',
    interest_request_id: scenario16.ids.reservation,
  })
  snapshot.email_delivery_events.push({
    id: eventId,
    actor_user_id: managerId,
    attempt_id: attemptId,
    entity_type: 'order_invitation',
    entity_id: scenario16.ids.invitation,
    template: 'order_invitation',
    template_version: 'v1',
    delivery_status: 'suppressed',
    provider_id: null,
    correlation_id: attemptId,
    details: { truthful_outcome: true },
  })
  const operations = [
    {
      action: 'board.process',
      idempotency_key: keys.process,
      result: { success: true, entityId: scenario01.ids.reservation, boardStage: 'interest', boardVersion: 1 },
    },
    {
      action: 'delivery.confirm',
      idempotency_key: keys.delivery,
      result: { success: true, entityId: scenario10.ids.order, deliveryConfirmed: true, boardStage: 'shipped', boardVersion: 1 },
    },
    {
      action: 'board.close',
      idempotency_key: keys.close,
      result: { success: true, entityId: scenario10.ids.order, boardStage: 'closed', boardVersion: 2 },
    },
    {
      action: 'invitation.send',
      idempotency_key: keys.invitation,
      result: { success: true, entityId: scenario16.ids.invitation, emailAttemptId: attemptId, deliveryStatus: 'suppressed' },
    },
  ]
  snapshot.admin_operation_idempotency = operations.map((operation, index) => ({
    actor_user_id: managerId,
    action: operation.action,
    idempotency_key: operation.idempotency_key,
    request_hash: String(index + 1).repeat(64),
    result: operation.result,
    created_at: '2026-08-04T12:00:00.000Z',
    completed_at: '2026-08-04T12:00:01.000Z',
  }))
  snapshot.admin_order_flow_state = [
    {
      drop_interest_request_id: scenario01.ids.reservation,
      processed_at: '2026-08-04T12:00:00.000Z',
      processed_by: managerId,
      delivery_confirmed_at: null,
      delivery_confirmed_by: null,
      closed_at: null,
      closed_by: null,
      closed_order_status: null,
      closed_fulfilment_status: null,
      version: 1,
    },
    {
      drop_interest_request_id: scenario10.ids.reservation,
      processed_at: null,
      processed_by: null,
      delivery_confirmed_at: '2026-08-04T12:00:00.000Z',
      delivery_confirmed_by: managerId,
      closed_at: '2026-08-04T12:00:01.000Z',
      closed_by: managerId,
      closed_order_status: 'paid',
      closed_fulfilment_status: 'shipped',
      version: 2,
    },
  ]
  const history = [
    ['56000000-0000-4000-8000-000000000003', 'order_flow.processed', 'reservation', scenario01.ids.reservation, keys.process, null, { source_type: 'drop' }],
    ['56000000-0000-4000-8000-000000000004', 'delivery.confirmed', 'order', scenario10.ids.order, keys.delivery, null, { fulfilment_status: 'shipped', tracking_present: true }],
    ['56000000-0000-4000-8000-000000000005', 'order_flow.closed', 'order', scenario10.ids.order, keys.close, null, { order_status: 'paid', fulfilment_status: 'shipped' }],
    ['56000000-0000-4000-8000-000000000006', 'order_invitation.delivery.suppressed', 'order_invitation', scenario16.ids.invitation, keys.invitation, attemptId, { delivery_status: 'suppressed', provider_confirmed: false }],
  ]
  const entityPayload = {
    'order_flow.processed': { source_type: 'drop' },
    'delivery.confirmed': { fulfilment_status: 'shipped' },
    'order_flow.closed': { order_status: 'paid', fulfilment_status: 'shipped' },
    'order_invitation.delivery.suppressed': { delivery_status: 'suppressed' },
  }
  history.forEach(([id, eventType, entityType, entityId, key, correlationId, details], index) => {
    snapshot.admin_audit_events.push({
      id,
      actor_user_id: managerId,
      action: eventType,
      entity_type: entityType,
      entity_id: entityId,
      correlation_id: correlationId,
      idempotency_key: key,
      details,
    })
    snapshot.entity_events.push({
      id: `56000000-0000-4000-8000-00000000001${index + 2}`,
      actor_user_id: managerId,
      source: 'admin',
      event_type: eventType,
      entity_type: entityType,
      entity_id: entityId,
      correlation_id: correlationId,
      idempotency_key: key,
      payload: entityPayload[eventType],
    })
  })
  return snapshot
}

test('wrong project and missing environment variables are blocked', () => {
  assert.doesNotThrow(
    () => assertExecutionContext({ env: runtimeEnv(), flags: new Set([EXECUTION_FLAG]) }),
  )
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
  assert.throws(
    () => assertExecutionContext({ env: runtimeEnv({ SUPABASE_URL: 'https://cdmocdodehjmcgtxicaj.supabase.co' }), flags: new Set([EXECUTION_FLAG]) }),
    /exact Clean Staging|Production or Legacy/,
  )
})

test('project-local CLI link must be present and exactly Clean Staging', (t) => {
  const clean = linkedCliRoot(t)
  assert.equal(assertLinkedCleanStagingProject({ root: clean.root }).projectRef, CLEAN_STAGING_REF)

  const production = linkedCliRoot(t, 'epqpeoubkbftcvxjbqeo')
  assert.throws(
    () => assertLinkedCleanStagingProject({ root: production.root }),
    /not exact Clean Staging/,
  )

  const missing = mkdtempSync(path.join(os.tmpdir(), 'pv-clean-staging-cli-missing-'))
  t.after(() => rmSync(missing, { force: true, recursive: true }))
  assert.throws(
    () => assertLinkedCleanStagingProject({ root: missing }),
    /link is unavailable/,
  )
})

test('Supabase CLI receives only operating-system environment values', () => {
  const child = sanitizedSupabaseCliEnvironment({
    ...runtimeEnv(),
    ADMIN_CONFIRMATION_SECRET: 'synthetic-placeholder',
    GH_TOKEN: 'synthetic-placeholder',
    RESEND_API_KEY: 'synthetic-placeholder',
    SUPABASE_ACCESS_TOKEN: 'synthetic-placeholder',
    SUPABASE_SERVICE_ROLE_KEY: 'synthetic-placeholder',
  })
  assert.equal(child.PGPASSWORD, undefined)
  assert.equal(child.PGHOST, undefined)
  assert.equal(child.SUPABASE_ACCESS_TOKEN, undefined)
  assert.equal(child.SUPABASE_SERVICE_ROLE_KEY, undefined)
  assert.equal(child.ADMIN_CONFIRMATION_SECRET, undefined)
  assert.equal(child.GH_TOKEN, undefined)
  assert.equal(child.RESEND_API_KEY, undefined)
})

test('linked query is exact-project pinned, keeps secrets out of the child and removes its SQL file', (t) => {
  const { root, temporaryRoot } = linkedCliRoot(t)
  let invocation
  const output = runLinkedQuery('select 1;', {
    env: runtimeEnv({ SUPABASE_SERVICE_ROLE_KEY: 'synthetic-placeholder' }),
    root,
    temporaryRoot,
    spawn(program, args, options) {
      const sqlFile = args[args.indexOf('--file') + 1]
      assert.equal(readFileSync(sqlFile, 'utf8'), 'select 1;')
      invocation = { args, options, program }
      return { status: 0, stdout: '{"rows":[]}' }
    },
  })
  assert.equal(output, '{"rows":[]}')
  assert.equal(invocation.args.includes('--linked'), true)
  assert.equal(invocation.args.some((argument) => argument.includes('synthetic-placeholder')), false)
  assert.equal(invocation.options.env.SUPABASE_SERVICE_ROLE_KEY, undefined)
  assert.equal(invocation.options.env.PGPASSWORD, undefined)
  assert.deepEqual(readFileSync(path.join(root, 'supabase/.temp/project-ref'), 'utf8'), CLEAN_STAGING_REF)
  assert.deepEqual(readFileSync(path.join(root, 'node_modules/supabase/dist/supabase.js'), 'utf8'), '')
  assert.deepEqual(readdirSync(temporaryRoot), [])
})

test('missing CLI authentication fails closed without exposing provider output', (t) => {
  const { root, temporaryRoot } = linkedCliRoot(t)
  const credentialMarker = 'synthetic-placeholder'
  assert.throws(
    () => runLinkedQuery('select 1;', {
      env: runtimeEnv({ SUPABASE_ACCESS_TOKEN: credentialMarker }),
      root,
      temporaryRoot,
      spawn(program, args, options) {
        assert.equal(args.some((argument) => argument.includes(credentialMarker)), false)
        assert.equal(Object.values(options.env).includes(credentialMarker), false)
        return { status: 1, stderr: `authentication failed: ${credentialMarker}` }
      },
    }),
    (error) => {
      assert.match(error.message, /failed closed/)
      assert.doesNotMatch(error.message, new RegExp(credentialMarker))
      return true
    },
  )
  assert.deepEqual(readdirSync(temporaryRoot), [])
})

test('linked CLI file output is parsed as one credential-free JSON result', (t) => {
  const { root, temporaryRoot } = linkedCliRoot(t)
  const parsed = queryJson('select json_build_object();', {
    root,
    temporaryRoot,
    spawn() {
      return {
        status: 0,
        stdout: '[{"result_json":"{\\"database\\":\\"postgres\\",\\"owner_capable\\":true}"}]',
      }
    },
  })
  assert.deepEqual(parsed, { database: 'postgres', owner_capable: true })
})

test('all sixteen scenarios satisfy fixture, schema and lifecycle contracts', () => {
  const snapshot = baselineSnapshot()
  const result = validateSnapshot(snapshot, { definition, managerUserId: managerId })
  assert.equal(definition.scenarios.length, 16)
  assert.deepEqual(result.retained, {
    admin_audit_events: 4,
    email_delivery_events: 4,
    entity_events: 4,
    operational_email_attempts: 4,
  })
})

test('one exact scenario 16 suppressed acceptance attempt and event is cleanup-eligible', () => {
  const snapshot = acceptanceSnapshot()
  const result = validateSnapshot(snapshot, {
    definition,
    expectOrderFlowAcceptance: true,
    managerUserId: managerId,
  })
  assert.equal(result.acceptance.attempt.delivery_status, 'suppressed')
  assert.equal(result.acceptance.deliveryEvent.attempt_id, result.acceptance.attempt.id)
  assert.deepEqual(cleanupPlan(snapshot).delete, {
    admin_operation_idempotency: 4,
    admin_order_flow_state: 2,
    drop_interest_requests: 16,
    operational_email_attempts: 1,
    order_invitations: 12,
    orders: 9,
    payments: 7,
  })
  assert.deepEqual(cleanupPlan(snapshot).retained_append_only_history, {
    admin_audit_events: 8,
    email_delivery_events: 5,
    entity_events: 8,
    operational_email_attempts: 5,
  })
})

test('expected acceptance evidence missing or duplicated blocks cleanup', () => {
  const missing = acceptanceSnapshot()
  missing.email_delivery_events.pop()
  assert.throws(
    () => validateOrderFlowAcceptanceEvidence(missing, { definition, managerUserId: managerId }),
    /exactly one additional delivery event/,
  )

  const duplicate = acceptanceSnapshot()
  duplicate.operational_email_attempts.push({
    ...clone(duplicate.operational_email_attempts.at(-1)),
    id: '56000000-0000-4000-8000-000000000099',
    idempotency_key: 'acceptance-unexpected-attempt',
  })
  assert.throws(
    () => validateOrderFlowAcceptanceEvidence(duplicate, { definition, managerUserId: managerId }),
    /exactly one additional delivery attempt/,
  )
})

test('acceptance attempt is bound to scenario 16 invitation and suppressed template status', () => {
  const wrongScenario = acceptanceSnapshot()
  const scenario15 = definition.scenarios.find((scenario) => scenario.number === 15)
  const scenario03 = definition.scenarios.find((scenario) => scenario.number === 3)
  wrongScenario.operational_email_attempts.at(-1).interest_request_id = scenario15.ids.reservation
  assert.throws(
    () => validateOrderFlowAcceptanceEvidence(wrongScenario, { definition, managerUserId: managerId }),
    /scenario 16 suppressed evidence/,
  )

  for (const [field, value] of [
    ['entity_id', scenario03.ids.invitation],
    ['template', 'shipping_confirmation'],
    ['delivery_status', 'sent'],
  ]) {
    const changed = acceptanceSnapshot()
    changed.operational_email_attempts.at(-1)[field] = value
    assert.throws(
      () => validateOrderFlowAcceptanceEvidence(changed, { definition, managerUserId: managerId }),
      /scenario 16 suppressed evidence/,
    )
  }
})

test('provider evidence or a changed delivery event blocks acceptance cleanup', () => {
  for (const mutate of [
    (snapshot) => { snapshot.operational_email_attempts.at(-1).provider_id = 'provider-evidence' },
    (snapshot) => { snapshot.email_delivery_events.at(-1).provider_id = 'provider-evidence' },
    (snapshot) => { snapshot.email_delivery_events.at(-1).details = { truthful_outcome: false } },
    (snapshot) => { snapshot.email_delivery_events.at(-1).attempt_id = '56000000-0000-4000-8000-000000000099' },
  ]) {
    const snapshot = acceptanceSnapshot()
    mutate(snapshot)
    assert.throws(
      () => validateOrderFlowAcceptanceEvidence(snapshot, { definition, managerUserId: managerId }),
      /suppressed evidence|delivery event changed|provider evidence/,
    )
  }
})

test('any unrelated non-synthetic attempt remains a fail-closed blocker', () => {
  const snapshot = acceptanceSnapshot()
  snapshot.operational_email_attempts.push({
    ...clone(snapshot.operational_email_attempts.at(-1)),
    id: '56000000-0000-4000-8000-000000000098',
    entity_id: definition.scenarios[1].ids.invitation,
    idempotency_key: 'unrelated-random-attempt',
  })
  assert.throws(
    () => validateSnapshot(snapshot, {
      definition,
      expectOrderFlowAcceptance: true,
      managerUserId: managerId,
    }),
    /exactly one additional delivery attempt/,
  )
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
    sqlQuery: queryHarness(state),
    sqlRun: seedHarness(state),
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
  assert.equal(auth.state.createCalls, 0)
  assert.equal(state.snapshot.admin_roles.length, 1)
  const ledgerText = readFileSync(path.join(root, '.tmp/clean-staging-seed-ledger.json'), 'utf8')
  assert.doesNotMatch(ledgerText, /@|manager@example|synthetic-placeholder|service-role-test-key/)
  assertLedgerSafe(JSON.parse(ledgerText))
})

test('database Auth inventory requires one confirmed fixture-owned identity', () => {
  assert.equal(assertDatabaseAuthInventory(databaseAuthInventory()).active.id, managerId)
  for (const inventory of [
    { active_users: [], deleted_user_ids: [] },
    { active_users: [{ confirmed: false, fixture_owned: true, id: managerId }], deleted_user_ids: [] },
    { active_users: [{ confirmed: true, fixture_owned: false, id: managerId }], deleted_user_ids: [] },
  ]) {
    assert.throws(() => assertDatabaseAuthInventory(inventory), /Auth identity/)
  }
  assert.throws(
    () => assertDatabaseAuthInventory({
      ...databaseAuthInventory(),
      deleted_user_ids: ['50000000-0000-4000-8000-000000000099'],
    }),
    /Unexpected deleted Auth identity/,
  )
})

test('seed and verify stop before Auth or writes when the owner gate fails', async () => {
  const auth = fakeAuth()
  let promptCalls = 0
  let writes = 0
  const failGate = () => {
    throw new Error('synthetic owner gate failure')
  }
  await assert.rejects(
    runSeed({
      argv: [EXECUTION_FLAG],
      authAdmin: auth,
      env: runtimeEnv(),
      output: () => {},
      prompt: async () => {
        promptCalls += 1
        return managerEmail
      },
      sqlQuery: failGate,
      sqlRun: () => { writes += 1 },
    }),
    /owner gate failure/,
  )
  await assert.rejects(
    runVerify({
      argv: [EXECUTION_FLAG],
      authAdmin: auth,
      env: runtimeEnv(),
      output: () => {},
      sqlQuery: failGate,
    }),
    /owner gate failure/,
  )
  assert.equal(promptCalls, 0)
  assert.equal(auth.state.listCalls, 0)
  assert.equal(auth.state.createCalls, 0)
  assert.equal(writes, 0)
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
    sqlQuery: queryHarness(state),
    sqlRun: () => { writes += 1 },
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
    sqlQuery: queryHarness(state),
    sqlRun: cleanupHarness(state),
  })
  assert.equal(state.snapshot.drop_interest_requests.length, 0)
  assert.equal(state.snapshot.orders.length, 0)
  assert.equal(state.snapshot.operational_email_attempts.length, 4)
  assert.equal(state.snapshot.admin_audit_events.length, 4)
  assert.equal(state.snapshot.email_delivery_events.length, 4)
  assert.equal(state.snapshot.entity_events.length, 4)
  validateCleanupSnapshot(state.snapshot, { definition, managerUserId: managerId })
})

test('acceptance cleanup removes only exact mutable work and retains attempt and append-only proof', async () => {
  const state = { snapshot: acceptanceSnapshot() }
  const proofAttemptId = state.snapshot.operational_email_attempts.at(-1).id
  const proofEventId = state.snapshot.email_delivery_events.at(-1).id
  await runCleanup({
    argv: [EXECUTION_FLAG, ORDER_FLOW_ACCEPTANCE_FLAG, '--confirm'],
    env: runtimeEnv(),
    output: () => {},
    sqlQuery: queryHarness(state),
    sqlRun: cleanupHarness(state),
  })
  assert.equal(state.snapshot.drop_interest_requests.length, 0)
  assert.equal(state.snapshot.admin_operation_idempotency.length, 0)
  assert.equal(state.snapshot.admin_order_flow_state.length, 0)
  assert.equal(state.snapshot.operational_email_attempts.length, 5)
  assert.equal(state.snapshot.email_delivery_events.length, 5)
  assert.equal(
    state.snapshot.operational_email_attempts.some((row) => row.id === proofAttemptId),
    true,
  )
  assert.equal(state.snapshot.email_delivery_events.some((row) => row.id === proofEventId), true)
  validateCleanupSnapshot(state.snapshot, {
    definition,
    expectOrderFlowAcceptance: true,
    managerUserId: managerId,
  })
})

test('acceptance cleanup flag fails when the expected run evidence is absent', async () => {
  const state = { snapshot: baselineSnapshot() }
  let writes = 0
  await assert.rejects(
    runCleanup({
      argv: [EXECUTION_FLAG, ORDER_FLOW_ACCEPTANCE_FLAG, '--confirm'],
      env: runtimeEnv(),
      output: () => {},
      sqlQuery: queryHarness(state),
      sqlRun: () => { writes += 1 },
    }),
    /exactly one additional delivery attempt/,
  )
  assert.equal(writes, 0)
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
      sqlQuery: queryHarness(state),
      sqlRun: () => { writes += 1 },
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
      sqlQuery: queryHarness(state),
      sqlRun: cleanupHarness(state),
    }),
    /also requires --remove-manager-role/,
  )
  assert.equal(auth.state.deleteCalls.length, 0)

  await runCleanup({
    argv: [EXECUTION_FLAG, '--confirm', '--remove-manager-role', '--remove-manager-user'],
    authAdmin: auth,
    env: runtimeEnv({ SUPABASE_SERVICE_ROLE_KEY: 'synthetic-placeholder' }),
    output: () => {},
    sqlQuery: queryHarness(state),
    sqlRun: cleanupHarness(state, { removeManagerRole: true }),
  })
  assert.deepEqual(auth.state.deleteCalls, [{ id: managerId, soft: true }])
})

test('generated SQL never changes schema, grants or append-only triggers', () => {
  const rows = materializeFixtures(definition, managerId)
  const seed = seedSql(rows, managerId)
  const cleanup = cleanupSql(rows, managerId, { removeManagerRole: true })
  const acceptanceSnapshotValue = acceptanceSnapshot()
  const acceptance = validateOrderFlowAcceptanceEvidence(acceptanceSnapshotValue, {
    definition,
    managerUserId: managerId,
  })
  const acceptanceCleanup = cleanupSql(rows, managerId, { acceptance })
  assert.doesNotMatch(seed, /(?:^|\n)\s*(?:alter|create|drop|grant|revoke)\s/i)
  assert.doesNotMatch(cleanup, /session_replication_role|disable\s+trigger/i)
  assert.doesNotMatch(acceptanceCleanup, /session_replication_role|disable\s+trigger/i)
  for (const table of ['admin_audit_events', 'email_delivery_events', 'entity_events']) {
    assert.doesNotMatch(cleanup, new RegExp(`delete\\s+from\\s+public\\.${table}`, 'i'))
    assert.doesNotMatch(
      acceptanceCleanup,
      new RegExp(`delete\\s+from\\s+public\\.${table}`, 'i'),
    )
  }
  const attemptDelete = acceptanceCleanup.match(
    /delete from public\.operational_email_attempts[\s\S]*?;/i,
  )?.[0]
  assert.ok(attemptDelete)
  assert.doesNotMatch(attemptDelete, new RegExp(acceptance.attempt.id, 'i'))
  assert.match(acceptanceCleanup, /raise exception 'acceptance_cleanup_scope_changed'/)
  assert.match(acceptanceCleanup, /raise exception 'acceptance_delivery_evidence_changed'/)
})
