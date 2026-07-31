import { spawn, spawnSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = path.resolve(fileURLToPath(new URL('../../', import.meta.url)))
const migrationDirectory = path.join(repositoryRoot, 'supabase', 'migrations')
const migrationName = '20260731113000_schema_baseline_v1.sql'
const migrationPath = path.join(migrationDirectory, migrationName)
const bootstrapPath = path.join(repositoryRoot, 'supabase', 'tests', 'schema-baseline-v1-bootstrap.sql')
const contractPath = path.join(repositoryRoot, 'supabase', 'tests', 'schema-baseline-v1-contract.sql')

const expected = {
  migrationBytes: 98_654,
  migrationLines: 1_513,
  migrationSha256: 'e4db9505f590ba934543e1ed33e25a8172e66c430596047afe4321d619d8f510',
  structuralFingerprint: '6b21a5c80183d9cffed0b5395fcfe231934a55654788dbc3d3a08d0ec5c8409c',
  fullFingerprint: '3c6d52fc996ded4cd77a316e1984315fd08aeec96e37ed66a07b58bb02613434',
  counts: {
    tables: 13,
    views: 4,
    enums: 2,
    routines: 27,
    triggers: 9,
    policies: 2,
    indexes: 57,
    constraints: 76,
    checks: 39,
    foreign_keys: 16,
    primary_keys: 13,
    unique_constraints: 8,
  },
}

if (process.env.POSTER_VALLEY_LOCAL_PG !== '1') {
  throw new Error('Refusing database access without POSTER_VALLEY_LOCAL_PG=1.')
}

const host = process.env.PGHOST || '127.0.0.1'
if (host !== '127.0.0.1') {
  throw new Error(`Refusing non-loopback PostgreSQL host '${host}'.`)
}

const port = process.env.PGPORT || '5432'
if (!/^\d{2,5}$/u.test(port)) throw new Error(`Invalid PostgreSQL port '${port}'.`)
const user = process.env.PGUSER || 'postgres'
const maintenanceDatabase = process.env.PGMAINTENANCE_DATABASE || 'postgres'
const psql = process.env.POSTGRES_PSQL || 'psql'
const createdb = process.env.POSTGRES_CREATEDB || 'createdb'
const dropdb = process.env.POSTGRES_DROPDB || 'dropdb'
const connectionArguments = ['-h', host, '-p', port, '-U', user]
const childEnvironment = { ...process.env, PGCONNECT_TIMEOUT: '5' }

function run(program, args, options = {}) {
  const result = spawnSync(program, args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    env: childEnvironment,
    maxBuffer: 16 * 1024 * 1024,
    ...options,
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join('\n').trim()
    throw new Error(`${path.basename(program)} failed with exit code ${result.status}${detail ? `:\n${detail}` : '.'}`)
  }
  return result.stdout || ''
}

function psqlArguments(database) {
  return ['-X', '-w', ...connectionArguments, '-d', database, '-v', 'ON_ERROR_STOP=1', '-Atq']
}

function sql(database, statement) {
  return run(psql, [...psqlArguments(database), '-c', statement]).trim()
}

function sqlFile(database, file) {
  run(psql, [...psqlArguments(database), '-f', file])
}

function scalar(database, statement) {
  const rows = sql(database, statement).split(/\r?\n/u).filter(Boolean)
  if (rows.length !== 1) throw new Error(`Expected one scalar row; received ${rows.length}.`)
  return rows[0]
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function lineCount(bytes) {
  const text = bytes.toString('utf8')
  if (!text) return 0
  const newlines = (text.match(/\n/gu) || []).length
  return newlines + (text.endsWith('\n') ? 0 : 1)
}

function assertEqual(actual, wanted, label) {
  if (actual !== wanted) throw new Error(`${label}: expected ${wanted}, received ${actual}.`)
}

function assertCounts(actual, label) {
  assertEqual(Object.keys(actual).length, Object.keys(expected.counts).length, `${label} key count`)
  for (const [name, wanted] of Object.entries(expected.counts)) {
    assertEqual(actual[name], wanted, `${label} ${name}`)
  }
}

function createDatabase(database) {
  run(createdb, [...connectionArguments, '-U', user, '-T', 'template0', database])
  sqlFile(database, bootstrapPath)
  sqlFile(database, migrationPath)
}

function dropDatabase(database) {
  run(dropdb, [...connectionArguments, '-U', user, '--if-exists', '--force', database])
}

const baseItems = String.raw`
select 'relation|'||n.nspname||'.'||c.relname||'|'||c.relkind::text||'|'||c.relrowsecurity::text||'|'||coalesce(array_to_string(c.reloptions,','),'') item
from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','v')
union all
select 'column|'||n.nspname||'.'||c.relname||'|'||a.attnum::text||'|'||a.attname||'|'||pg_catalog.format_type(a.atttypid,a.atttypmod)||'|'||a.attnotnull::text||'|'||coalesce(pg_catalog.pg_get_expr(d.adbin,d.adrelid),'')
from pg_catalog.pg_attribute a join pg_catalog.pg_class c on c.oid=a.attrelid join pg_catalog.pg_namespace n on n.oid=c.relnamespace left join pg_catalog.pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
where n.nspname='public' and c.relkind in ('r','v') and a.attnum>0 and not a.attisdropped
union all
select 'constraint|'||n.nspname||'.'||c.conname||'|'||c.contype::text||'|'||pg_catalog.pg_get_constraintdef(c.oid,true)
from pg_catalog.pg_constraint c join pg_catalog.pg_namespace n on n.oid=c.connamespace where n.nspname='public'
union all
select 'index|'||n.nspname||'.'||c.relname||'|'||pg_catalog.pg_get_indexdef(c.oid)
from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='i'
union all
select 'routine|'||n.nspname||'.'||p.proname||'('||pg_catalog.pg_get_function_identity_arguments(p.oid)||')|'||p.prosecdef::text||'|'||coalesce(array_to_string(p.proconfig,','),'')||'|'||pg_catalog.pg_get_functiondef(p.oid)
from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
union all
select 'trigger|'||n.nspname||'.'||c.relname||'.'||t.tgname||'|'||pg_catalog.pg_get_triggerdef(t.oid,true)
from pg_catalog.pg_trigger t join pg_catalog.pg_class c on c.oid=t.tgrelid join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and not t.tgisinternal
union all
select 'policy|'||n.nspname||'.'||c.relname||'.'||p.polname||'|'||p.polcmd::text||'|'||coalesce(pg_catalog.pg_get_expr(p.polqual,p.polrelid),'')||'|'||coalesce(pg_catalog.pg_get_expr(p.polwithcheck,p.polrelid),'')||'|'||array_to_string(p.polroles,',')
from pg_catalog.pg_policy p join pg_catalog.pg_class c on c.oid=p.polrelid join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname='public'
union all
select 'enum|'||n.nspname||'.'||t.typname||'|'||e.enumsortorder::text||'|'||e.enumlabel
from pg_catalog.pg_enum e join pg_catalog.pg_type t on t.oid=e.enumtypid join pg_catalog.pg_namespace n on n.oid=t.typnamespace where n.nspname='public'
`

const aclItems = String.raw`
select 'acl|schema|'||n.nspname||'|'||case when a.grantee=0 then 'PUBLIC' else pg_catalog.pg_get_userbyid(a.grantee) end||'|'||a.privilege_type||'|'||a.is_grantable::text
from pg_catalog.pg_namespace n cross join lateral pg_catalog.aclexplode(n.nspacl) a where n.nspname='public'
union all
select 'acl|relation|'||n.nspname||'.'||c.relname||'|'||case when a.grantee=0 then 'PUBLIC' else pg_catalog.pg_get_userbyid(a.grantee) end||'|'||a.privilege_type||'|'||a.is_grantable::text
from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace cross join lateral pg_catalog.aclexplode(c.relacl) a where n.nspname='public' and c.relkind in ('r','v','S')
union all
select 'acl|routine|'||n.nspname||'.'||p.proname||'('||pg_catalog.pg_get_function_identity_arguments(p.oid)||')|'||case when a.grantee=0 then 'PUBLIC' else pg_catalog.pg_get_userbyid(a.grantee) end||'|'||a.privilege_type||'|'||a.is_grantable::text
from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace cross join lateral pg_catalog.aclexplode(p.proacl) a where n.nspname='public'
`

function evidence(database) {
  const structuralFingerprint = scalar(database, `with items as (${baseItems}) select encode(extensions.digest(string_agg(item,E'\n' order by item),'sha256'),'hex') from items`)
  const aclFingerprint = scalar(database, `with items as (${baseItems} union all ${aclItems}) select encode(extensions.digest(string_agg(item,E'\n' order by item),'sha256'),'hex') from items`)
  const tables = sql(database, "select quote_ident(c.relname) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' order by c.relname").split(/\r?\n/u).filter(Boolean)
  const manifest = tables.map((table) => `${table}=${scalar(database, `select count(*) from public.${table}`)}`)
  manifest.push(`product_config=${scalar(database, "select coalesce(jsonb_agg(jsonb_build_object('product_code',product_code,'title',title,'lifecycle_mode',lifecycle_mode,'commerce_authority',commerce_authority) order by product_code)::text,'[]') from public.product_registry")}`)
  const counts = JSON.parse(scalar(database, String.raw`
select jsonb_build_object(
'tables',(select count(*) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'),
'views',(select count(*) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='v'),
'enums',(select count(*) from pg_catalog.pg_type t join pg_catalog.pg_namespace n on n.oid=t.typnamespace where n.nspname='public' and t.typtype='e'),
'routines',(select count(*) from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname='public'),
'triggers',(select count(*) from pg_catalog.pg_trigger t join pg_catalog.pg_class c on c.oid=t.tgrelid join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and not t.tgisinternal),
'policies',(select count(*) from pg_catalog.pg_policy p join pg_catalog.pg_class c on c.oid=p.polrelid join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname='public'),
'indexes',(select count(*) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='i'),
'constraints',(select count(*) from pg_catalog.pg_constraint c join pg_catalog.pg_namespace n on n.oid=c.connamespace where n.nspname='public'),
'checks',(select count(*) from pg_catalog.pg_constraint c join pg_catalog.pg_namespace n on n.oid=c.connamespace where n.nspname='public' and c.contype='c'),
'foreign_keys',(select count(*) from pg_catalog.pg_constraint c join pg_catalog.pg_namespace n on n.oid=c.connamespace where n.nspname='public' and c.contype='f'),
'primary_keys',(select count(*) from pg_catalog.pg_constraint c join pg_catalog.pg_namespace n on n.oid=c.connamespace where n.nspname='public' and c.contype='p'),
'unique_constraints',(select count(*) from pg_catalog.pg_constraint c join pg_catalog.pg_namespace n on n.oid=c.connamespace where n.nspname='public' and c.contype='u'))::text
`))
  return {
    structuralFingerprint,
    fullFingerprint: sha256(Buffer.from(`${aclFingerprint}\n${manifest.join('\n')}`, 'utf8')),
    counts,
    manifest,
  }
}

function startPsqlScript(database, script) {
  const child = spawn(psql, psqlArguments(database), {
    cwd: repositoryRoot,
    env: childEnvironment,
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  let stdout = ''
  let stderr = ''
  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')
  child.stdout.on('data', (chunk) => { stdout += chunk })
  child.stderr.on('data', (chunk) => { stderr += chunk })
  child.stdin.end(script)
  const completed = new Promise((resolve, reject) => {
    child.on('error', reject)
    child.on('close', (code) => code === 0 ? resolve() : reject(new Error(`concurrent psql failed with exit code ${code}: ${stderr.trim()}`)))
  })
  return { child, completed, stdout: () => stdout, stderr: () => stderr }
}

async function waitForOutput(process, marker, timeoutMs = 5_000) {
  const startedAt = Date.now()
  while (!process.stdout().includes(marker)) {
    if (Date.now() - startedAt > timeoutMs) throw new Error(`Timed out waiting for '${marker}'.`)
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
}

async function paymentRuntime(database) {
  sql(database, String.raw`
insert into public.drop_interest_requests(id,drop_slug,drop_title,full_name,email,email_normalized,country,country_code,preferred_format,quantity,record_origin)
values('10000000-0000-4000-8000-000000000001','eurofighter-typhoon','Eurofighter Typhoon','Ada Fixture','ada@example.test','ada@example.test','Netherlands','NL','A2',1,'test');
insert into public.order_invitations(id,interest_request_id,drop_id,drop_slug,drop_title,email,email_normalized,first_name,last_name,quantity,currency,unit_price,subtotal_amount,status,token_hash,expires_at)
values('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','drop_eurofighter_typhoon','eurofighter-typhoon','Eurofighter Typhoon','ada@example.test','ada@example.test','Ada','Fixture',1,'EUR',17.75,17.75,'sent',repeat('a',64),now()+interval '1 day');
`)
  const orderJson = JSON.stringify({
    interest_request_id: '10000000-0000-4000-8000-000000000001',
    drop_id: 'drop_eurofighter_typhoon',
    drop_slug: 'eurofighter-typhoon',
    drop_title: 'Eurofighter Typhoon',
    email: 'ada@example.test',
    first_name: 'Ada',
    last_name: 'Fixture',
    quantity: 1,
    currency: 'EUR',
    unit_price: 17.75,
    subtotal_amount: 17.75,
    shipping_amount: 5.95,
    total_amount: 23.70,
    shipping_profile_id: 'protected-a2',
    manual_shipping_quote_id: null,
    shipping_country: 'Netherlands',
    shipping_country_code: 'NL',
    shipping_name: 'Ada Fixture',
    shipping_company: null,
    address_line1: '1 Test Street',
    address_line2: null,
    postal_code: '1015 CJ',
    city: 'Amsterdam',
    region: null,
    accepted_terms_at: '2026-07-31T12:00:00Z',
    metadata: { shipping_label: 'Netherlands' },
  }).replaceAll("'", "''")
  const requestHash = 'b'.repeat(64)
  const claimOne = '30000000-0000-4000-8000-000000000001'
  const claimTwo = '30000000-0000-4000-8000-000000000002'
  const invitation = '20000000-0000-4000-8000-000000000001'
  const first = startPsqlScript(database, `
begin;
set local role service_role;
select payment_start_claim('${invitation}','${requestHash}','${claimOne}','${orderJson}'::jsonb)->>'claimOwner';
select 'CLAIM_READY';
select pg_sleep(1.5);
commit;
`)
  await waitForOutput(first, 'CLAIM_READY')
  const second = startPsqlScript(database, `set role service_role; select payment_start_claim('${invitation}','${requestHash}','${claimTwo}','${orderJson}'::jsonb)->>'claimOwner';`)
  await Promise.all([first.completed, second.completed])
  if (!first.stdout().split(/\r?\n/u).includes('true') || !second.stdout().split(/\r?\n/u).includes('false')) {
    throw new Error(`Concurrent claims did not produce one owner and one reuse: [${first.stdout().trim()}] [${second.stdout().trim()}].`)
  }
  assertEqual(scalar(database, `select count(*) from public.orders where invitation_id='${invitation}'`), '1', 'canonical concurrent order count')
  assertEqual(scalar(database, 'select count(*) from public.payments'), '0', 'pre-provider payment count')

  const orderId = scalar(database, `select id from public.orders where invitation_id='${invitation}'`)
  assertEqual(scalar(database, `set role service_role; select payment_start_begin_provider('${orderId}','${requestHash}','${claimOne}')->>'started'`), 'true', 'provider start claim')
  assertEqual(scalar(database, `set role service_role; select payment_start_complete('${orderId}','${requestHash}','${claimOne}','tr_runtimefixture','open',23.70,'EUR','https://checkout.test/tr_runtimefixture','https://preview.postervalley.test/order/fixture','{"mollie_status":"open"}'::jsonb)->>'checkoutUrl'`), 'https://checkout.test/tr_runtimefixture', 'payment completion checkout')
  assertEqual(scalar(database, "select (select count(*) from public.orders)::text || '/' || (select count(*) from public.payments)::text"), '1/1', 'canonical order/payment count')
  assertEqual(scalar(database, `set role service_role; select payment_start_claim('${invitation}','${requestHash}','30000000-0000-4000-8000-000000000003','${orderJson}'::jsonb)->>'checkoutUrl'`), 'https://checkout.test/tr_runtimefixture', 'payment replay checkout')
  sql(database, `
do $$
begin
  perform public.payment_start_claim('${invitation}',repeat('c',64),'30000000-0000-4000-8000-000000000004','${orderJson}'::jsonb);
  raise exception 'expected payment_idempotency_conflict';
exception when sqlstate 'P0001' then
  if sqlerrm <> 'payment_idempotency_conflict' then raise; end if;
end;
$$;
`)
}

const activeFiles = readdirSync(migrationDirectory).sort()
if (activeFiles.length !== 1 || activeFiles[0] !== migrationName) {
  throw new Error(`Expected exactly one active migration (${migrationName}); received ${activeFiles.join(', ') || 'none'}.`)
}
const migrationBytes = readFileSync(migrationPath)
assertEqual(migrationBytes.byteLength, expected.migrationBytes, 'canonical migration size')
assertEqual(lineCount(migrationBytes), expected.migrationLines, 'canonical migration line count')
assertEqual(sha256(migrationBytes), expected.migrationSha256, 'canonical migration SHA-256')

const serverVersion = Number(scalar(maintenanceDatabase, 'show server_version_num'))
if (!Number.isInteger(serverVersion) || serverVersion < 170_000 || serverVersion >= 180_000) {
  throw new Error(`PostgreSQL 17 is required; server_version_num is ${serverVersion}.`)
}

const baselineRoleCount = scalar(maintenanceDatabase, "select count(*) from pg_catalog.pg_roles where rolname in ('anon','authenticated','service_role')")
if (baselineRoleCount === '0') {
  // The accepted historical fingerprint serialized pg_policy.polroles as raw OIDs. Reserve the
  // same four disposable OIDs used by that proof so the frozen fingerprint remains reproducible.
  sql(maintenanceDatabase, `
create role pv_baseline_oid_reservation_1 nologin;
create role pv_baseline_oid_reservation_2 nologin;
create role pv_baseline_oid_reservation_3 nologin;
create role pv_baseline_oid_reservation_4 nologin;
drop role pv_baseline_oid_reservation_1;
drop role pv_baseline_oid_reservation_2;
drop role pv_baseline_oid_reservation_3;
drop role pv_baseline_oid_reservation_4;
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
`)
} else if (baselineRoleCount !== '3') {
  throw new Error(`Expected zero or all three local Supabase roles; received ${baselineRoleCount}.`)
}
assertEqual(scalar(maintenanceDatabase, "select count(*) from pg_catalog.pg_roles where (rolname='anon' and oid=16388 and not rolcanlogin and not rolbypassrls) or (rolname='authenticated' and oid=16389 and not rolcanlogin and not rolbypassrls) or (rolname='service_role' and oid=16390 and not rolcanlogin and rolbypassrls)"), '3', 'local Supabase role and historical fingerprint OID contract')

const suffix = `${process.pid}_${randomBytes(4).toString('hex')}`
const databases = [`pv_baseline_${suffix}_1`, `pv_baseline_${suffix}_2`]
let runOne
let runTwo
try {
  createDatabase(databases[0])
  runOne = evidence(databases[0])
  sqlFile(databases[0], contractPath)
  dropDatabase(databases[0])

  createDatabase(databases[1])
  runTwo = evidence(databases[1])
  sqlFile(databases[1], contractPath)

  assertEqual(runOne.structuralFingerprint, expected.structuralFingerprint, 'run 1 structural fingerprint')
  assertEqual(runTwo.structuralFingerprint, expected.structuralFingerprint, 'run 2 structural fingerprint')
  assertEqual(runOne.fullFingerprint, expected.fullFingerprint, 'run 1 full fingerprint')
  assertEqual(runTwo.fullFingerprint, expected.fullFingerprint, 'run 2 full fingerprint')
  assertCounts(runOne.counts, 'run 1 object counts')
  assertCounts(runTwo.counts, 'run 2 object counts')
  assertEqual(JSON.stringify(runOne.manifest), JSON.stringify(runTwo.manifest), 'run data manifests')
  assertEqual(sha256(readFileSync(migrationPath)), expected.migrationSha256, 'post-run canonical migration SHA-256')

  await paymentRuntime(databases[1])

  console.log(JSON.stringify({
    postgresVersion: scalar(maintenanceDatabase, 'show server_version'),
    migration: { name: migrationName, bytes: migrationBytes.byteLength, lines: lineCount(migrationBytes), sha256: expected.migrationSha256 },
    run1: { counts: runOne.counts, structuralFingerprint: runOne.structuralFingerprint, fullFingerprint: runOne.fullFingerprint },
    run2: { counts: runTwo.counts, structuralFingerprint: runTwo.structuralFingerprint, fullFingerprint: runTwo.fullFingerprint },
    paymentRuntime: 'concurrency/replay/conflict passed',
  }, null, 2))
} finally {
  for (const database of databases) {
    try { dropDatabase(database) } catch (error) { console.error(`Cleanup failed for ${database}: ${error.message}`) }
  }
}
