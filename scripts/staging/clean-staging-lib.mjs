import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

export const CLEAN_STAGING_REF = 'stbunwkgvxfwmbjivgos'
export const PRODUCTION_REF = 'epqpeoubkbftcvxjbqeo'
export const LEGACY_STAGING_REF = 'cdmocdodehjmcgtxicaj'
export const FIXTURE_SET = 'PV-CLEAN-STAGING-V1'
export const EXECUTION_FLAG = '--confirm-clean-staging'
export const LEDGER_PATH = '.tmp/clean-staging-seed-ledger.json'

const fixtureFile = fileURLToPath(
  new URL('./fixtures/clean-staging-v1.json', import.meta.url),
)
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const fixturePrefix = 'pv-clean-staging-v1-'
const protectedTables = [
  'admin_audit_events',
  'email_delivery_events',
  'entity_events',
]
const mutableTables = [
  'drop_interest_requests',
  'order_invitations',
  'orders',
  'payments',
  'operational_email_attempts',
]

function fail(message) {
  throw new Error(message)
}

export function parseFlags(argv = process.argv.slice(2)) {
  return new Set(argv)
}

export function assertExecutionContext({ env = process.env, flags = parseFlags() } = {}) {
  if (env.POSTER_VALLEY_ENV !== 'clean-staging') {
    fail('POSTER_VALLEY_ENV must be exactly clean-staging.')
  }
  if (!flags.has(EXECUTION_FLAG)) {
    fail(`Explicit execution permission ${EXECUTION_FLAG} is required.`)
  }
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    fail('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.')
  }

  let url
  try {
    url = new URL(env.SUPABASE_URL)
  } catch {
    fail('SUPABASE_URL is invalid.')
  }
  if (
    url.protocol !== 'https:' ||
    url.hostname !== `${CLEAN_STAGING_REF}.supabase.co` ||
    (url.pathname !== '/' && url.pathname !== '') ||
    url.username ||
    url.password ||
    url.port
  ) {
    fail('SUPABASE_URL does not identify the exact Clean Staging project.')
  }

  const targetText = [
    env.SUPABASE_URL,
    env.PGHOST,
    env.PGUSER,
    env.PGDATABASE,
  ]
    .filter(Boolean)
    .join(' ')
  if (targetText.includes(PRODUCTION_REF) || targetText.includes(LEGACY_STAGING_REF)) {
    fail('Production or Legacy Staging appeared in the requested target.')
  }
  return { projectRef: CLEAN_STAGING_REF, supabaseUrl: url.origin }
}

export function assertOwnerConnectionTarget(env = process.env) {
  const host = String(env.PGHOST ?? '').toLowerCase()
  const user = String(env.PGUSER ?? '')
  const database = String(env.PGDATABASE ?? '')
  const port = String(env.PGPORT ?? '5432')
  const direct =
    host === `db.${CLEAN_STAGING_REF}.supabase.co` && user === 'postgres'
  const pooler =
    host.endsWith('.pooler.supabase.com') &&
    user === `postgres.${CLEAN_STAGING_REF}`

  if (!direct && !pooler) {
    fail('PGHOST and PGUSER do not identify the exact Clean Staging owner connection.')
  }
  if (database !== 'postgres' || port !== '5432') {
    fail('Owner connection must use database postgres and session port 5432.')
  }
  if (env.PGSSLMODE && !['require', 'verify-ca', 'verify-full'].includes(env.PGSSLMODE)) {
    fail('PGSSLMODE must require TLS.')
  }
  return { database, direct, host, pooler, port, user }
}

export async function hiddenPrompt(label, input = process.stdin, output = process.stdout) {
  if (!input.isTTY || typeof input.setRawMode !== 'function') {
    fail('Interactive hidden input requires a TTY.')
  }
  output.write(label)
  input.setEncoding('utf8')
  input.setRawMode(true)
  input.resume()
  try {
    return await new Promise((resolve, reject) => {
      let value = ''
      const onData = (chunk) => {
        for (const character of chunk) {
          if (character === '\u0003') {
            input.off('data', onData)
            output.write('\n')
            reject(new Error('Interactive input cancelled.'))
            return
          }
          if (character === '\r' || character === '\n') {
            input.off('data', onData)
            output.write('\n')
            resolve(value)
            return
          }
          if (character === '\b' || character === '\u007f') {
            value = value.slice(0, -1)
          } else if (character >= ' ') {
            value += character
          }
        }
      }
      input.on('data', onData)
    })
  } finally {
    input.setRawMode(false)
    input.pause()
  }
}

export async function resolveOwnerEnvironment({
  env = process.env,
  prompt = hiddenPrompt,
} = {}) {
  assertOwnerConnectionTarget(env)
  const password = env.PGPASSWORD || (await prompt('Clean Staging database password: '))
  if (!password) fail('An owner database credential is required.')
  return {
    ...env,
    PGCONNECT_TIMEOUT: env.PGCONNECT_TIMEOUT || '10',
    PGPASSWORD: password,
    PGSSLMODE: env.PGSSLMODE || 'require',
  }
}

export function sanitizedPsqlEnvironment(env) {
  const child = {}
  const systemNames = new Set([
    'ComSpec',
    'LANG',
    'LC_ALL',
    'PATH',
    'PATHEXT',
    'SystemRoot',
    'TEMP',
    'TMP',
  ])
  for (const [name, value] of Object.entries(env)) {
    if (systemNames.has(name) || /^PG[A-Z0-9_]+$/.test(name)) child[name] = value
  }
  return child
}

export function runPsql(
  sql,
  { env, spawn = spawnSync, psql = env.POSTGRES_PSQL || 'psql' } = {},
) {
  const result = spawn(
    psql,
    [
      '-X',
      '--no-psqlrc',
      '--set=ON_ERROR_STOP=1',
      '--quiet',
      '--tuples-only',
      '--no-align',
      `--dbname=${env.PGDATABASE}`,
    ],
    {
      encoding: 'utf8',
      env: sanitizedPsqlEnvironment(env),
      input: sql,
      maxBuffer: 16 * 1024 * 1024,
      shell: false,
      windowsHide: true,
    },
  )
  if (result.error || result.status !== 0) {
    const error = new Error('Owner database operation failed closed.')
    error.cause = result.error
    throw error
  }
  return String(result.stdout ?? '').trim()
}

export function queryJson(sql, options) {
  const output = runPsql(sql, options)
  if (!output) fail('Owner database query returned no result.')
  try {
    return JSON.parse(output.split(/\r?\n/).at(-1))
  } catch {
    fail('Owner database query returned an invalid result.')
  }
}

export function ownerCapabilitySql() {
  return `
select pg_catalog.json_build_object(
  'owner_capable',
    pg_catalog.has_table_privilege(current_user, 'public.admin_roles', 'select,insert,update,delete')
    and pg_catalog.has_table_privilege(current_user, 'public.drop_interest_requests', 'select,insert,update,delete')
    and pg_catalog.has_table_privilege(current_user, 'public.order_invitations', 'select,insert,update,delete')
    and pg_catalog.has_table_privilege(current_user, 'public.orders', 'select,insert,update,delete')
    and pg_catalog.has_table_privilege(current_user, 'public.payments', 'select,insert,update,delete')
    and pg_catalog.has_table_privilege(current_user, 'public.operational_email_attempts', 'select,insert,update,delete')
    and pg_catalog.has_table_privilege(current_user, 'public.admin_audit_events', 'select,insert')
    and pg_catalog.has_table_privilege(current_user, 'public.email_delivery_events', 'select,insert')
    and pg_catalog.has_table_privilege(current_user, 'public.entity_events', 'select,insert'),
  'protected_triggers_enabled', (
    select pg_catalog.count(*) = 3 and pg_catalog.bool_and(t.tgenabled = 'O')
    from pg_catalog.pg_trigger t
    where not t.tgisinternal
      and t.tgname in ('admin_audit_events_no_update','email_delivery_events_no_update','entity_events_no_update')
  ),
  'migration_count', (
    select pg_catalog.count(*) from supabase_migrations.schema_migrations
    where version in ('20260731113000','20260731193947')
  ),
  'migration_total', (
    select pg_catalog.count(*) from supabase_migrations.schema_migrations
  )
)::text;
`
}

export function assertOwnerCapabilities(capabilities) {
  if (
    capabilities?.owner_capable !== true ||
    capabilities?.protected_triggers_enabled !== true
  ) {
    fail('Owner privileges or append-only triggers do not match the approved contract.')
  }
  if (capabilities.migration_count !== 2 || capabilities.migration_total !== 2) {
    fail('Clean Staging migration history is not the exact baseline plus hardening pair.')
  }
}

export function loadFixtureDefinition(file = fixtureFile) {
  const definition = JSON.parse(readFileSync(file, 'utf8'))
  validateFixtureDefinition(definition)
  return definition
}

export function validateFixtureDefinition(definition) {
  if (definition?.fixture_set !== FIXTURE_SET || definition?.version !== 1) {
    fail('Fixture set identity is invalid.')
  }
  if (!Array.isArray(definition.scenarios) || definition.scenarios.length !== 14) {
    fail('Exactly fourteen fixture scenarios are required.')
  }
  const numbers = new Set()
  const keys = new Set()
  const ids = new Set()
  for (const scenario of definition.scenarios) {
    if (!Number.isInteger(scenario.number) || scenario.number < 1 || scenario.number > 14) {
      fail('Fixture scenario number is invalid.')
    }
    if (!/^[a-z][a-z0-9_]{2,60}$/.test(scenario.key)) {
      fail('Fixture scenario key is invalid.')
    }
    if (numbers.has(scenario.number) || keys.has(scenario.key)) {
      fail('Fixture scenario identities must be unique.')
    }
    numbers.add(scenario.number)
    keys.add(scenario.key)
    for (const id of Object.values(scenario.ids ?? {})) {
      if (!uuidPattern.test(id) || ids.has(id)) fail('Fixture UUIDs must be valid and unique.')
      ids.add(id)
    }
  }
  return definition
}

function digest(value) {
  return createHash('sha256').update(value).digest('hex')
}

function scenarioEmail(number) {
  return `pv-clean-staging-v1-s${String(number).padStart(2, '0')}@example.invalid`
}

function marker(scenario) {
  return { fixture_set: FIXTURE_SET, scenario: scenario.key }
}

function requireManagerId(managerUserId) {
  if (!uuidPattern.test(managerUserId ?? '')) fail('Manager user id is invalid.')
  return managerUserId.toLowerCase()
}

export function materializeFixtures(definition, managerUserId) {
  validateFixtureDefinition(definition)
  const actor = requireManagerId(managerUserId)
  const rows = {
    admin_audit_events: [],
    drop_interest_requests: [],
    email_delivery_events: [],
    entity_events: [],
    operational_email_attempts: [],
    order_invitations: [],
    orders: [],
    payments: [],
  }

  for (const scenario of definition.scenarios) {
    const number = String(scenario.number).padStart(2, '0')
    const email = scenarioEmail(scenario.number)
    const metadata = marker(scenario)
    rows.drop_interest_requests.push({
      id: scenario.ids.reservation,
      drop_id: 'poster-valley-drop-01',
      drop_slug: 'eurofighter-typhoon-a2',
      drop_title: 'Eurofighter Typhoon / A2',
      first_name: 'Synthetic',
      last_name: `Scenario ${number}`,
      full_name: `Synthetic Scenario ${number}`,
      email,
      email_normalized: email,
      country: 'Netherlands',
      country_code: 'NL',
      preferred_format: 'A2',
      quantity: 1,
      shipping_address: null,
      note: `Synthetic Clean Staging scenario ${number}`,
      source_path: '/clean-staging-fixtures',
      consent_contact: true,
      accepted_reservation_terms: true,
      marketing_opt_in: false,
      reservation_status: scenario.reservation.reservation_status,
      status: scenario.reservation.status,
      metadata,
      record_origin: 'test',
      record_origin_needs_review:
        scenario.reservation.record_origin_needs_review === true,
      record_origin_version: 0,
    })

    if (scenario.invitation) {
      rows.order_invitations.push({
        id: scenario.ids.invitation,
        interest_request_id: scenario.ids.reservation,
        drop_id: 'poster-valley-drop-01',
        drop_slug: 'eurofighter-typhoon-a2',
        drop_title: 'Eurofighter Typhoon / A2',
        email,
        email_normalized: email,
        first_name: 'Synthetic',
        last_name: `Scenario ${number}`,
        quantity: 1,
        currency: 'EUR',
        unit_price: 65,
        subtotal_amount: 65,
        status: scenario.invitation.status,
        token_hash: digest(`${FIXTURE_SET}:${scenario.key}:invitation-token`),
        expires_at: '2099-12-31T23:59:59.000Z',
        sent_at: scenario.invitation.status === 'draft' ? null : '2026-07-31T12:00:00.000Z',
        opened_at: null,
        metadata,
      })
    }

    if (scenario.order) {
      const claimed = scenario.order.payment_start_status === 'claimed'
      const reconciling = scenario.order.payment_start_status === 'reconciliation_required'
      const providerStarted = ['provider_created', 'reconciliation_required'].includes(
        scenario.order.payment_start_status,
      )
      const shipped = scenario.order.fulfilment_status === 'shipped'
      rows.orders.push({
        id: scenario.ids.order,
        invitation_id: scenario.ids.invitation,
        interest_request_id: scenario.ids.reservation,
        drop_id: 'poster-valley-drop-01',
        drop_slug: 'eurofighter-typhoon-a2',
        drop_title: 'Eurofighter Typhoon / A2',
        status: scenario.order.status,
        email,
        first_name: 'Synthetic',
        last_name: `Scenario ${number}`,
        quantity: 1,
        currency: 'EUR',
        unit_price: 65,
        subtotal_amount: 65,
        shipping_amount: 9.95,
        total_amount: 74.95,
        shipping_profile_id: 'pv-test-nl-standard',
        shipping_country: 'Netherlands',
        shipping_country_code: 'NL',
        shipping_name: `Synthetic Scenario ${number}`,
        address_line1: `Testlaan ${scenario.number}`,
        address_line2: null,
        postal_code: `10${number} ZZ`,
        city: 'Teststad',
        region: null,
        accepted_terms_at: '2026-07-31T12:00:00.000Z',
        metadata,
        fulfilment_status: scenario.order.fulfilment_status,
        fulfilment_version: scenario.order.fulfilment_version,
        carrier: shipped ? 'PV Test Carrier' : null,
        tracking_number: shipped ? `PVTEST${number}` : null,
        shipped_at: shipped ? '2026-07-31T14:00:00.000Z' : null,
        shipping_email_status: scenario.order.shipping_email_status,
        manual_shipping_quote_id: null,
        shipping_company: null,
        payment_request_hash: digest(`${FIXTURE_SET}:${scenario.key}:payment-request`),
        payment_provider_idempotency_key: `5d000000-0000-4000-8000-0000000000${number}`,
        payment_start_status: scenario.order.payment_start_status,
        payment_claim_id: claimed
          ? `5c000000-0000-4000-8000-0000000000${number}`
          : null,
        payment_claim_expires_at: claimed ? '2099-12-31T23:59:59.000Z' : null,
        payment_provider_started_at: providerStarted
          ? '2026-07-31T12:05:00.000Z'
          : null,
        payment_reconciliation_required_at: reconciling
          ? '2026-07-31T12:06:00.000Z'
          : null,
      })
    }

    if (scenario.payment) {
      const paid = scenario.payment.status === 'paid'
      rows.payments.push({
        id: scenario.ids.payment,
        order_id: scenario.ids.order,
        provider: 'mollie',
        provider_payment_id: `tr_testPVCLEANSTAGINGV1S${number}`,
        status: scenario.payment.status,
        amount: 74.95,
        currency: 'EUR',
        checkout_url:
          scenario.payment.status === 'open'
            ? `https://checkout.example.invalid/${fixturePrefix}s${number}`
            : null,
        redirect_url: `https://preview.example.invalid/order/${fixturePrefix}s${number}`,
        webhook_received_at: paid ? '2026-07-31T12:10:00.000Z' : null,
        paid_at: paid ? '2026-07-31T12:10:00.000Z' : null,
        metadata: { ...metadata, provider_mode: 'mock' },
      })
    }

    if (scenario.email_attempt) {
      const completed = scenario.email_attempt.delivery_status !== 'pending'
      const invitationTemplate = scenario.email_attempt.template === 'order_invitation'
      const idempotencyKey = `${fixturePrefix}s${number}-${scenario.email_attempt.template}`
      rows.operational_email_attempts.push({
        id: scenario.ids.email_attempt,
        actor_user_id: actor,
        action: invitationTemplate ? 'invitation.send' : 'fulfilment.transition',
        idempotency_key: idempotencyKey,
        template: scenario.email_attempt.template,
        template_version: 'v1',
        entity_type: invitationTemplate ? 'order_invitation' : 'order',
        entity_id: invitationTemplate ? scenario.ids.invitation : scenario.ids.order,
        token_hash: invitationTemplate
          ? digest(`${FIXTURE_SET}:${scenario.key}:delivery-token`)
          : null,
        expires_at: invitationTemplate ? '2099-12-31T23:59:59.000Z' : null,
        delivery_status: scenario.email_attempt.delivery_status,
        provider_id: null,
        completed_at: completed ? '2026-07-31T15:00:00.000Z' : null,
        interest_request_id: scenario.ids.reservation,
      })

      if (scenario.append_history) {
        const action = invitationTemplate
          ? `order_invitation.delivery.${scenario.email_attempt.delivery_status}`
          : `shipping_confirmation.delivery.${scenario.email_attempt.delivery_status}`
        rows.email_delivery_events.push({
          id: scenario.ids.delivery_event,
          actor_user_id: actor,
          attempt_id: scenario.ids.email_attempt,
          entity_type: invitationTemplate ? 'order_invitation' : 'order',
          entity_id: invitationTemplate ? scenario.ids.invitation : scenario.ids.order,
          template: scenario.email_attempt.template,
          template_version: 'v1',
          delivery_status: scenario.email_attempt.delivery_status,
          provider_id: null,
          correlation_id: scenario.ids.email_attempt,
          details: { ...metadata, truthful_outcome: true },
        })
        rows.admin_audit_events.push({
          id: scenario.ids.audit_event,
          actor_user_id: actor,
          action,
          entity_type: invitationTemplate ? 'order_invitation' : 'order',
          entity_id: invitationTemplate ? scenario.ids.invitation : scenario.ids.order,
          correlation_id: scenario.ids.email_attempt,
          idempotency_key: `${idempotencyKey}-audit`,
          details: { ...metadata, delivery_status: scenario.email_attempt.delivery_status },
        })
        rows.entity_events.push({
          id: scenario.ids.entity_event,
          actor_user_id: actor,
          source: 'admin',
          event_type: action,
          entity_type: invitationTemplate ? 'order_invitation' : 'order',
          entity_id: invitationTemplate ? scenario.ids.invitation : scenario.ids.order,
          correlation_id: scenario.ids.email_attempt,
          idempotency_key: `${idempotencyKey}-entity`,
          payload: { ...metadata, delivery_status: scenario.email_attempt.delivery_status },
        })
      }
    }
  }
  return rows
}

export function snapshotSql() {
  const jsonRows = (table, order = 'id') => `(
    select coalesce(pg_catalog.json_agg(row_to_json(x)), '[]'::json)
    from (select * from public.${table} order by ${order}) x
  )`
  return `
select pg_catalog.json_build_object(
  'admin_roles', ${jsonRows('admin_roles', 'user_id')},
  'admin_operation_idempotency', ${jsonRows('admin_operation_idempotency', 'actor_user_id, action, idempotency_key')},
  'admin_audit_events', ${jsonRows('admin_audit_events')},
  'drop_interest_requests', ${jsonRows('drop_interest_requests')},
  'email_delivery_events', ${jsonRows('email_delivery_events')},
  'entity_events', ${jsonRows('entity_events')},
  'manual_shipping_quotes', ${jsonRows('manual_shipping_quotes')},
  'newsletter_signups', ${jsonRows('newsletter_signups')},
  'operational_email_attempts', ${jsonRows('operational_email_attempts')},
  'order_invitations', ${jsonRows('order_invitations')},
  'orders', ${jsonRows('orders')},
  'payments', ${jsonRows('payments')},
  'product_registry', ${jsonRows('product_registry', 'product_code')}
)::text;
`
}

export function createAuthAdmin(env = process.env) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  }).auth.admin
}

export async function listAllAuthUsers(authAdmin, { maxPages = 10 } = {}) {
  const users = []
  for (let page = 1; page <= maxPages; page += 1) {
    const { data, error } = await authAdmin.listUsers({ page, perPage: 1000 })
    if (error) fail('Supabase Auth inventory failed closed.')
    const batch = data?.users
    if (!Array.isArray(batch)) fail('Supabase Auth inventory returned an invalid result.')
    users.push(...batch)
    if (batch.length < 1000) return users
  }
  fail('Supabase Auth inventory exceeded the bounded page limit.')
}

function isSoftDeletedUser(user) {
  return Boolean(user?.deleted_at)
}

function isFixtureOwnedUser(user) {
  return user?.app_metadata?.fixture_set === FIXTURE_SET
}

function validateManagerEmail(email) {
  const normalized = String(email ?? '').trim().toLowerCase()
  if (
    normalized.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)
  ) {
    fail('Manager email is invalid.')
  }
  return normalized
}

export function assertAuthInventory(
  users,
  { allowedDeletedUserIds = [], managerEmail = null } = {},
) {
  const active = users.filter((user) => !isSoftDeletedUser(user))
  const retained = users.filter(isSoftDeletedUser)
  const allowedDeleted = new Set(allowedDeletedUserIds)
  if (
    retained.some(
      (user) => !isFixtureOwnedUser(user) && !allowedDeleted.has(user.id),
    )
  ) {
    fail('Unexpected non-fixture soft-deleted Auth user exists.')
  }
  if (managerEmail) {
    const normalized = validateManagerEmail(managerEmail)
    const matches = active.filter(
      (user) => String(user.email ?? '').toLowerCase() === normalized,
    )
    if (matches.length > 1 || active.some((user) => !matches.includes(user))) {
      fail('Unexpected Auth user or duplicate manager identity exists.')
    }
    return { active, matches, retained }
  }
  if (active.length > 1) fail('More than one active Auth user exists.')
  return { active, matches: [], retained }
}

export async function ensureManagerUser({ authAdmin, email, users = null }) {
  const normalized = validateManagerEmail(email)
  const inventory = users ?? (await listAllAuthUsers(authAdmin))
  const { matches } = assertAuthInventory(inventory, { managerEmail: normalized })
  let manager = matches[0]
  let created = false

  if (!manager) {
    const { data, error } = await authAdmin.createUser({
      app_metadata: { fixture_set: FIXTURE_SET, fixture_version: 1 },
      email: normalized,
      email_confirm: true,
    })
    if (error || !data?.user?.id) fail('Manager Auth bootstrap failed closed.')
    manager = data.user
    created = true
  } else if (!manager.email_confirmed_at) {
    const { data, error } = await authAdmin.updateUserById(manager.id, {
      email_confirm: true,
    })
    if (error || !data?.user?.id) fail('Manager email confirmation failed closed.')
    manager = data.user
  }

  requireManagerId(manager.id)
  return { created, manager }
}

export async function softDeleteManagerUser({ authAdmin, managerUserId, users = null }) {
  const id = requireManagerId(managerUserId)
  const inventory = users ?? (await listAllAuthUsers(authAdmin))
  const user = inventory.find((candidate) => candidate.id === id && !isSoftDeletedUser(candidate))
  if (!user) fail('Active manager Auth user was not found.')
  if (!isFixtureOwnedUser(user)) {
    fail('A reused non-fixture manager Auth user must never be removed by cleanup.')
  }
  const { error } = await authAdmin.deleteUser(id, true)
  if (error) fail('Manager Auth soft-delete failed closed.')
  return true
}

function expectedIds(rows, table) {
  return new Set(rows[table].map((row) => row.id))
}

function assertExactIdSet(actual, expected, label, { allowMissing = false } = {}) {
  const actualIds = new Set(actual.map((row) => row.id))
  for (const id of actualIds) {
    if (!expected.has(id)) fail(`Unexpected ${label} record exists.`)
  }
  if (!allowMissing) {
    for (const id of expected) {
      if (!actualIds.has(id)) fail(`Expected ${label} record is missing.`)
    }
  }
}

function assertJsonMarker(rows, column, label) {
  for (const row of rows) {
    if (row?.[column]?.fixture_set !== FIXTURE_SET) {
      fail(`${label} record is not fixture-marked.`)
    }
  }
}

function assertSafeEmails(snapshot) {
  for (const table of ['drop_interest_requests', 'order_invitations', 'orders']) {
    for (const row of snapshot[table]) {
      if (!String(row.email ?? '').toLowerCase().endsWith('@example.invalid')) {
        fail(`Non-synthetic email exists in ${table}.`)
      }
    }
  }
}

function mapById(rows) {
  return new Map(rows.map((row) => [row.id, row]))
}

function assertScenarioContracts(snapshot, definition, { allowMissing = false } = {}) {
  const maps = Object.fromEntries(
    mutableTables.concat(protectedTables).map((table) => [table, mapById(snapshot[table])]),
  )
  const orderInvitationIds = new Set()
  const paymentKeys = new Set()

  for (const scenario of definition.scenarios) {
    const reservation = maps.drop_interest_requests.get(scenario.ids.reservation)
    if (reservation) {
      if (
        reservation.record_origin !== 'test' ||
        reservation.reservation_status !== scenario.reservation.reservation_status ||
        reservation.status !== scenario.reservation.status ||
        reservation.record_origin_needs_review !==
          (scenario.reservation.record_origin_needs_review === true)
      ) {
        fail(`Reservation contract mismatch for scenario ${scenario.number}.`)
      }
    } else if (!allowMissing) fail(`Reservation missing for scenario ${scenario.number}.`)

    if (scenario.invitation) {
      const invitation = maps.order_invitations.get(scenario.ids.invitation)
      if (invitation) {
        if (
          invitation.interest_request_id !== scenario.ids.reservation ||
          invitation.status !== scenario.invitation.status
        ) {
          fail(`Invitation contract mismatch for scenario ${scenario.number}.`)
        }
      } else if (!allowMissing) fail(`Invitation missing for scenario ${scenario.number}.`)
    }

    if (scenario.order) {
      const order = maps.orders.get(scenario.ids.order)
      if (order) {
        if (
          order.invitation_id !== scenario.ids.invitation ||
          order.interest_request_id !== scenario.ids.reservation ||
          order.status !== scenario.order.status ||
          order.payment_start_status !== scenario.order.payment_start_status ||
          order.fulfilment_status !== scenario.order.fulfilment_status ||
          Number(order.fulfilment_version) !== scenario.order.fulfilment_version ||
          order.shipping_email_status !== scenario.order.shipping_email_status
        ) {
          fail(`Order contract mismatch for scenario ${scenario.number}.`)
        }
        if (orderInvitationIds.has(order.invitation_id)) fail('Duplicate order for invitation.')
        orderInvitationIds.add(order.invitation_id)
        if (
          scenario.order.fulfilment_status === 'shipped' &&
          (!order.carrier || !order.tracking_number || !order.shipped_at)
        ) {
          fail('Shipped fixture lacks shipping details.')
        }
        const state = order.payment_start_status
        const validState =
          (state === 'claimed' && order.payment_claim_id && order.payment_claim_expires_at && !order.payment_provider_started_at && !order.payment_reconciliation_required_at) ||
          (state === 'provider_created' && !order.payment_claim_id && !order.payment_claim_expires_at && order.payment_provider_started_at && !order.payment_reconciliation_required_at) ||
          (state === 'reconciliation_required' && !order.payment_claim_id && !order.payment_claim_expires_at && order.payment_provider_started_at && order.payment_reconciliation_required_at)
        if (!validState) fail('Payment-start state contract mismatch.')
      } else if (!allowMissing) fail(`Order missing for scenario ${scenario.number}.`)
    }

    if (scenario.payment) {
      const payment = maps.payments.get(scenario.ids.payment)
      if (payment) {
        if (
          payment.order_id !== scenario.ids.order ||
          payment.provider !== 'mollie' ||
          payment.status !== scenario.payment.status ||
          !String(payment.provider_payment_id).startsWith('tr_testPVCLEANSTAGINGV1') ||
          payment.metadata?.provider_mode !== 'mock'
        ) {
          fail(`Payment contract mismatch for scenario ${scenario.number}.`)
        }
        if (payment.checkout_url) {
          let checkout
          try {
            checkout = new URL(payment.checkout_url)
          } catch {
            fail('Fixture checkout URL is invalid.')
          }
          if (!checkout.hostname.endsWith('.example.invalid')) fail('Live checkout URL detected.')
        }
        const paymentKey = `${payment.order_id}:${payment.provider}`
        if (paymentKeys.has(paymentKey)) fail('Duplicate order/provider payment.')
        paymentKeys.add(paymentKey)
      } else if (!allowMissing) fail(`Payment missing for scenario ${scenario.number}.`)
    }

    if (scenario.email_attempt) {
      const attempt = maps.operational_email_attempts.get(scenario.ids.email_attempt)
      if (attempt) {
        if (
          attempt.template !== scenario.email_attempt.template ||
          attempt.delivery_status !== scenario.email_attempt.delivery_status ||
          !attempt.idempotency_key.startsWith(fixturePrefix)
        ) {
          fail(`Delivery-attempt contract mismatch for scenario ${scenario.number}.`)
        }
      } else if (!allowMissing) fail(`Delivery attempt missing for scenario ${scenario.number}.`)
    }
  }
}

export function validateSnapshot(
  snapshot,
  { definition, managerUserId, allowMissing = false, requireManager = true } = {},
) {
  const rows = materializeFixtures(definition, managerUserId)
  for (const table of mutableTables.concat(protectedTables)) {
    if (!Array.isArray(snapshot?.[table])) fail(`Snapshot lacks ${table}.`)
    assertExactIdSet(snapshot[table], expectedIds(rows, table), table, { allowMissing })
  }

  assertJsonMarker(snapshot.drop_interest_requests, 'metadata', 'Reservation')
  assertJsonMarker(snapshot.order_invitations, 'metadata', 'Invitation')
  assertJsonMarker(snapshot.orders, 'metadata', 'Order')
  assertJsonMarker(snapshot.payments, 'metadata', 'Payment')
  assertJsonMarker(snapshot.admin_audit_events, 'details', 'Audit event')
  assertJsonMarker(snapshot.email_delivery_events, 'details', 'Delivery event')
  assertJsonMarker(snapshot.entity_events, 'payload', 'Entity event')
  for (const attempt of snapshot.operational_email_attempts) {
    if (!attempt.idempotency_key.startsWith(fixturePrefix)) {
      fail('Delivery attempt is not fixture-marked.')
    }
  }

  if (
    snapshot.admin_operation_idempotency.length ||
    snapshot.manual_shipping_quotes.length ||
    snapshot.newsletter_signups.length
  ) {
    fail('Unexpected non-synthetic business data exists.')
  }
  if (
    snapshot.product_registry.length !== 1 ||
    snapshot.product_registry[0]?.product_code !== 'eurofighter-typhoon-a2'
  ) {
    fail('Product registry differs from the canonical baseline fixture-independent row.')
  }

  const managerId = requireManagerId(managerUserId)
  const activeManagers = snapshot.admin_roles.filter(
    (row) => row.role === 'manager' && row.revoked_at === null,
  )
  const unexpectedRoles = snapshot.admin_roles.filter((row) => row.user_id !== managerId)
  if (unexpectedRoles.length || activeManagers.length > 1) {
    fail('Unexpected admin role or second active manager exists.')
  }
  if (
    requireManager &&
    (activeManagers.length !== 1 || activeManagers[0].user_id !== managerId)
  ) {
    fail('Exactly one expected active manager is required.')
  }

  assertSafeEmails(snapshot)
  assertScenarioContracts(snapshot, definition, { allowMissing })
  return { rows, retained: retainedHistory(snapshot) }
}

export function retainedHistory(snapshot) {
  return {
    admin_audit_events: snapshot.admin_audit_events.length,
    email_delivery_events: snapshot.email_delivery_events.length,
    entity_events: snapshot.entity_events.length,
    operational_email_attempts: snapshot.operational_email_attempts.filter((attempt) =>
      snapshot.email_delivery_events.some((event) => event.attempt_id === attempt.id),
    ).length,
  }
}

export function scenarioMatrix(snapshot, definition) {
  const maps = Object.fromEntries(
    mutableTables.map((table) => [table, mapById(snapshot[table])]),
  )
  return definition.scenarios.map((scenario) => ({
    number: scenario.number,
    scenario: scenario.key,
    reservation: maps.drop_interest_requests.get(scenario.ids.reservation)?.reservation_status ?? 'missing',
    invitation: scenario.ids.invitation
      ? maps.order_invitations.get(scenario.ids.invitation)?.status ?? 'missing'
      : '-',
    order: scenario.ids.order ? maps.orders.get(scenario.ids.order)?.status ?? 'missing' : '-',
    payment: scenario.ids.payment
      ? maps.payments.get(scenario.ids.payment)?.status ?? 'missing'
      : '-',
    fulfilment: scenario.ids.order
      ? maps.orders.get(scenario.ids.order)?.fulfilment_status ?? 'missing'
      : '-',
    delivery: scenario.ids.email_attempt
      ? maps.operational_email_attempts.get(scenario.ids.email_attempt)?.delivery_status ?? 'missing'
      : '-',
  }))
}

function sqlLiteral(value) {
  if (value === null || value === undefined) return 'null'
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('Fixture contains a non-finite number.')
    return String(value)
  }
  if (typeof value === 'object') {
    return `${sqlLiteral(JSON.stringify(value))}::jsonb`
  }
  return `'${String(value).replaceAll("'", "''")}'`
}

function insertRowsSql(table, rows, { onConflict = 'id', update = null } = {}) {
  return rows
    .map((row) => {
      const columns = Object.keys(row)
      const values = columns.map((column) => sqlLiteral(row[column]))
      const conflict = update
        ? `on conflict (${onConflict}) do update set ${update}`
        : `on conflict (${onConflict}) do nothing`
      return `insert into public.${table} (${columns.join(',')}) values (${values.join(',')}) ${conflict};`
    })
    .join('\n')
}

function idList(rows) {
  return rows.length ? rows.map((row) => sqlLiteral(row.id)).join(',') : 'null'
}

function seedGuardSql(rows, managerUserId) {
  return `
do $fixture_guard$
begin
  if exists (select 1 from public.admin_roles where user_id <> ${sqlLiteral(managerUserId)}::uuid)
     or exists (select 1 from public.admin_roles where user_id = ${sqlLiteral(managerUserId)}::uuid and role <> 'manager') then
    raise exception 'unexpected_admin_role';
  end if;
  if exists (select 1 from public.drop_interest_requests where id not in (${idList(rows.drop_interest_requests)}) or metadata->>'fixture_set' is distinct from ${sqlLiteral(FIXTURE_SET)})
     or exists (select 1 from public.order_invitations where id not in (${idList(rows.order_invitations)}) or metadata->>'fixture_set' is distinct from ${sqlLiteral(FIXTURE_SET)})
     or exists (select 1 from public.orders where id not in (${idList(rows.orders)}) or metadata->>'fixture_set' is distinct from ${sqlLiteral(FIXTURE_SET)})
     or exists (select 1 from public.payments where id not in (${idList(rows.payments)}) or metadata->>'fixture_set' is distinct from ${sqlLiteral(FIXTURE_SET)})
     or exists (select 1 from public.operational_email_attempts where id not in (${idList(rows.operational_email_attempts)}) or idempotency_key not like ${sqlLiteral(`${fixturePrefix}%`)})
     or exists (select 1 from public.admin_audit_events where id not in (${idList(rows.admin_audit_events)}) or details->>'fixture_set' is distinct from ${sqlLiteral(FIXTURE_SET)})
     or exists (select 1 from public.email_delivery_events where id not in (${idList(rows.email_delivery_events)}) or details->>'fixture_set' is distinct from ${sqlLiteral(FIXTURE_SET)})
     or exists (select 1 from public.entity_events where id not in (${idList(rows.entity_events)}) or payload->>'fixture_set' is distinct from ${sqlLiteral(FIXTURE_SET)}) then
    raise exception 'unexpected_business_data';
  end if;
  if exists (select 1 from public.admin_operation_idempotency)
     or exists (select 1 from public.manual_shipping_quotes)
     or exists (select 1 from public.newsletter_signups) then
    raise exception 'unexpected_business_data';
  end if;
end
$fixture_guard$;
`
}

export function seedSql(rows, managerUserId) {
  const managerId = requireManagerId(managerUserId)
  const lockTables = [
    'admin_roles',
    'admin_operation_idempotency',
    'drop_interest_requests',
    'order_invitations',
    'orders',
    'payments',
    'operational_email_attempts',
    'email_delivery_events',
    'admin_audit_events',
    'entity_events',
    'manual_shipping_quotes',
    'newsletter_signups',
  ]
    .map((table) => `public.${table}`)
    .join(',')
  return `
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
lock table ${lockTables} in share row exclusive mode;
${seedGuardSql(rows, managerId)}
insert into public.admin_roles (user_id, role, granted_by, revoked_at)
values (${sqlLiteral(managerId)}::uuid, 'manager', null, null)
on conflict (user_id) do update set role='manager', revoked_at=null;
${insertRowsSql('drop_interest_requests', rows.drop_interest_requests)}
${insertRowsSql('order_invitations', rows.order_invitations)}
${insertRowsSql('orders', rows.orders)}
${insertRowsSql('payments', rows.payments)}
${insertRowsSql('operational_email_attempts', rows.operational_email_attempts, {
    update: 'interest_request_id=excluded.interest_request_id',
  })}
${insertRowsSql('email_delivery_events', rows.email_delivery_events)}
${insertRowsSql('admin_audit_events', rows.admin_audit_events)}
${insertRowsSql('entity_events', rows.entity_events)}
commit;
`
}

export function cleanupSql(rows, managerUserId, { removeManagerRole = false } = {}) {
  const managerId = requireManagerId(managerUserId)
  const roleSql = removeManagerRole
    ? `delete from public.admin_roles where user_id=${sqlLiteral(managerId)}::uuid and role='manager';`
    : ''
  return `
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
lock table public.admin_roles,public.drop_interest_requests,public.order_invitations,public.orders,public.payments,public.operational_email_attempts,public.email_delivery_events in share row exclusive mode;
delete from public.operational_email_attempts a
where a.id in (${idList(rows.operational_email_attempts)})
  and a.idempotency_key like ${sqlLiteral(`${fixturePrefix}%`)}
  and not exists (select 1 from public.email_delivery_events e where e.attempt_id=a.id);
delete from public.payments
where id in (${idList(rows.payments)}) and metadata->>'fixture_set'=${sqlLiteral(FIXTURE_SET)};
delete from public.orders
where id in (${idList(rows.orders)}) and metadata->>'fixture_set'=${sqlLiteral(FIXTURE_SET)};
delete from public.order_invitations
where id in (${idList(rows.order_invitations)}) and metadata->>'fixture_set'=${sqlLiteral(FIXTURE_SET)};
delete from public.drop_interest_requests
where id in (${idList(rows.drop_interest_requests)}) and metadata->>'fixture_set'=${sqlLiteral(FIXTURE_SET)} and record_origin='test';
${roleSql}
commit;
`
}

export function cleanupPlan(snapshot, { removeManagerRole = false, removeManagerUser = false } = {}) {
  const retained = retainedHistory(snapshot)
  return {
    delete: {
      drop_interest_requests: snapshot.drop_interest_requests.length,
      operational_email_attempts: snapshot.operational_email_attempts.length - retained.operational_email_attempts,
      order_invitations: snapshot.order_invitations.length,
      orders: snapshot.orders.length,
      payments: snapshot.payments.length,
    },
    manager_role: removeManagerRole ? 'remove' : 'retain',
    manager_user: removeManagerUser ? 'soft-delete-if-fixture-owned' : 'retain',
    retained_append_only_history: retained,
  }
}

export function validateCleanupSnapshot(
  snapshot,
  { definition, managerRoleExpected = true, managerUserId } = {},
) {
  validateSnapshot(snapshot, {
    allowMissing: true,
    definition,
    managerUserId,
    requireManager: false,
  })
  for (const table of ['drop_interest_requests', 'order_invitations', 'orders', 'payments']) {
    if (snapshot[table].length) fail(`Limited cleanup left mutable ${table} fixtures.`)
  }
  const referencedAttempts = new Set(snapshot.email_delivery_events.map((event) => event.attempt_id))
  if (snapshot.operational_email_attempts.some((attempt) => !referencedAttempts.has(attempt.id))) {
    fail('Limited cleanup left an unreferenced mutable delivery attempt.')
  }
  const activeManagers = snapshot.admin_roles.filter(
    (row) => row.role === 'manager' && row.revoked_at === null,
  )
  if (managerRoleExpected ? activeManagers.length !== 1 : activeManagers.length !== 0) {
    fail('Manager role cleanup result does not match the explicit flags.')
  }
  return { retained: retainedHistory(snapshot) }
}

export function buildLedger({
  definition,
  managerUserId,
  now = new Date(),
  rows,
  snapshot = null,
}) {
  const records = []
  for (const [table, tableRows] of Object.entries(rows)) {
    for (const row of tableRows) records.push({ id: row.id, table })
  }
  records.push({ id: requireManagerId(managerUserId), table: 'admin_roles' })
  const actorIds = new Set(
    (snapshot
      ? [
          ...snapshot.operational_email_attempts,
          ...snapshot.admin_audit_events,
          ...snapshot.email_delivery_events,
          ...snapshot.entity_events,
        ]
      : [
          ...rows.operational_email_attempts,
          ...rows.admin_audit_events,
          ...rows.email_delivery_events,
          ...rows.entity_events,
        ]
    )
      .map((row) => row.actor_user_id)
      .filter(Boolean),
  )
  for (const id of actorIds) records.push({ id, table: 'auth.users' })
  const retainedAppendOnlyEventIds = protectedTables.flatMap((table) =>
    rows[table].map((row) => ({ id: row.id, table })),
  )
  const ledger = {
    created_at: now.toISOString(),
    fixture_set: definition.fixture_set,
    fixture_version: definition.version,
    manager_user_id: requireManagerId(managerUserId),
    records,
    retained_append_only_event_ids: retainedAppendOnlyEventIds,
  }
  assertLedgerSafe(ledger)
  return ledger
}

export function assertLedgerSafe(ledger) {
  const serialized = JSON.stringify(ledger)
  if (/@|(?:password|secret|token)(?:"|:|_)/i.test(serialized)) {
    fail('Ledger contains personal data or secret material.')
  }
  if (!uuidPattern.test(ledger?.manager_user_id ?? '')) {
    fail('Ledger manager id is invalid.')
  }
  return true
}

export function writeLedger(
  ledger,
  { root = process.cwd(), ledgerPath = LEDGER_PATH } = {},
) {
  assertLedgerSafe(ledger)
  const target = path.resolve(root, ledgerPath)
  const directory = path.dirname(target)
  mkdirSync(directory, { recursive: true })
  const temporary = `${target}.tmp`
  writeFileSync(temporary, `${JSON.stringify(ledger, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  })
  renameSync(temporary, target)
  return target
}

export function readLedger({ root = process.cwd(), ledgerPath = LEDGER_PATH } = {}) {
  const target = path.resolve(root, ledgerPath)
  if (!existsSync(target)) return null
  const ledger = JSON.parse(readFileSync(target, 'utf8'))
  assertLedgerSafe(ledger)
  return ledger
}

export function printScenarioMatrix(matrix, output = console.log) {
  output('Clean Staging fixture matrix (no personal data)')
  for (const row of matrix) {
    output(
      `  ${String(row.number).padStart(2, '0')} ${row.scenario}: reservation=${row.reservation}; invitation=${row.invitation}; order=${row.order}; payment=${row.payment}; fulfilment=${row.fulfilment}; delivery=${row.delivery}`,
    )
  }
}

export function printCounts(label, counts, output = console.log) {
  output(label)
  for (const [name, count] of Object.entries(counts)) output(`  ${name}: ${count}`)
}
