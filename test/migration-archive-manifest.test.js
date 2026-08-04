import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readdir, readFile, stat } from 'node:fs/promises'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = new URL('../', import.meta.url)
const rootPath = fileURLToPath(root)
const activeDirectory = new URL('../supabase/migrations/', import.meta.url)
const archiveDirectory = new URL('../supabase/migrations-archive/pre-baseline-v1/', import.meta.url)
const canonicalName = '20260731113000_schema_baseline_v1.sql'
const canonicalSha = 'e4db9505f590ba934543e1ed33e25a8172e66c430596047afe4321d619d8f510'
const hardeningName = '20260731193947_harden_default_privileges.sql'
const hardeningSha = '8d72db969029fa97595993e01a6ca2018aeedfd55ed242965db66a55528846b9'
const shippingName = '20260802130000_shipping_confirmation_safety.sql'
const shippingSha = '2ddf9459f72af2e35a75d19b8ffed44d631ba3aebfde01dc3418656d818cf8bf'
const orderFlowName = '20260802192136_order_flow_board.sql'
const orderFlowSha = '87dd0afc52f760317c1d2fa0dfbc95fd0fe8275e685e1fac7e1c165618f9b658'
const thresholdName = '20260802210626_default_drop_production_threshold.sql'
const thresholdSha = '76324138304c2c41c956c9ea1c0cd2438d65696666b8193c676d59b515d4c993'
const invitationFlowName = '20260804103202_simplify_order_flow_invitation_thresholds.sql'
const invitationFlowSha = '756f8155d3046840113d3c46ec3fa2598657a79d8923260bc82d725fe54c64d1'
const activeMigrations = [
  [canonicalName, canonicalSha],
  [hardeningName, hardeningSha],
  [shippingName, shippingSha],
  [orderFlowName, orderFlowSha],
  [thresholdName, thresholdSha],
  [invitationFlowName, invitationFlowSha],
]
const archivePromotionCommit = '73fed0224056f040ce085fbedeb27461695d8c30'

const originalGitHashes = new Map([
  ['20260720090000_admin_auth_data_foundation.sql', '2ddcc8886e03fb7258a8340f4a8b8d63dd617ba64da96a4847cce7e33ed99711'],
  ['20260720093000_admin_auth_data_hardening.sql', '5ab8a31fefe3eb3cad09d63617a77a6c591991139511164a5d5290f6e7702d2e'],
  ['20260720110000_admin_operational_actions.sql', '26a3b009f8beb420e190a10e77e8100c6462aae5ecc495caaf0254741cef19bf'],
  ['20260720165432_admin_operational_actions_runtime_fix.sql', '56f11c61b26ae9fd1a8c9c672b40dc2a015f8f19e549cee287c322c42d93dcd0'],
  ['20260721083831_a3_1_admin_customer_data_record_origin.sql', 'dbb62796df0bb2db7e492566dd72a96aa7c5e7b917a9654a61d61d22f81a8013'],
  ['20260721151023_admin_invitation_delivery_confirmation.sql', 'b30d199e801b5386afa8b308a1bcea551e08f2866c021c13e14d20d9853e2016'],
])

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function gitBytes(object, path) {
  return execFileSync('git', ['show', `${object}:${path}`], {
    cwd: rootPath,
    maxBuffer: 2 * 1024 * 1024,
  })
}

function gitText(arguments_) {
  return execFileSync('git', arguments_, {
    cwd: rootPath,
    encoding: 'utf8',
    maxBuffer: 2 * 1024 * 1024,
  }).trimEnd()
}

function canonicalizeCheckoutBytes(bytes, fileName) {
  const text = bytes.toString('utf8')
  assert.equal(Buffer.compare(Buffer.from(text, 'utf8'), bytes), 0, `${fileName} must contain valid UTF-8`)
  assert.doesNotMatch(text, /\r(?!\n)/u, `${fileName} must not contain lone carriage returns`)
  return Buffer.from(text.replace(/\r\n/gu, '\n'), 'utf8')
}

test('the canonical baseline and five additive feature migrations are the only active migrations', async () => {
  const activeFiles = (await readdir(activeDirectory)).sort()
  assert.deepEqual(activeFiles, activeMigrations.map(([fileName]) => fileName))

  for (const [fileName, expectedSha] of activeMigrations) {
    const migration = canonicalizeCheckoutBytes(await readFile(new URL(fileName, activeDirectory)), fileName)
    assert.equal(sha256(migration), expectedSha, `${fileName} must retain its allowlisted SHA-256`)
  }

  const canonical = canonicalizeCheckoutBytes(await readFile(new URL(canonicalName, activeDirectory)), canonicalName)
  assert.equal(canonical.byteLength, 98_654)
  assert.equal(sha256(canonical), canonicalSha)
  assert.equal(canonical.toString('utf8').split(/\r?\n/u).filter((_, index, lines) => index < lines.length - 1 || lines[index] !== '').length, 1_513)
})

test('the pre-baseline manifest exactly binds every archived migration to its original bytes', async () => {
  const manifest = JSON.parse(await readFile(new URL('manifest.json', archiveDirectory), 'utf8'))
  assert.equal(manifest.schemaVersion, 1)
  assert.equal(manifest.status, 'historical_pre_baseline_generation')
  assert.equal(manifest.hash_algorithm, 'sha256')
  assert.equal(manifest.hash_source, 'canonical_git_checkout_bytes_lf')
  assert.equal(manifest.activeMigrationDirectory, 'supabase/migrations')
  assert.match(manifest.note, /must never be executed as active migrations by the Supabase CLI/i)
  assert.equal(manifest.files.length, 6)

  const archiveFiles = (await readdir(archiveDirectory)).sort()
  assert.deepEqual(
    archiveFiles,
    [...manifest.files.map((entry) => `${entry.version}_${entry.name}.sql`), 'manifest.json'].sort(),
  )
  assert.deepEqual(
    manifest.files.map((entry) => `${entry.version}_${entry.name}.sql`).sort(),
    [...originalGitHashes.keys()].sort(),
  )

  for (const entry of manifest.files) {
    const fileName = `${entry.version}_${entry.name}.sql`
    assert.equal(entry.originalPath, `supabase/migrations/${fileName}`)
    assert.equal(entry.archivePath, `supabase/migrations-archive/pre-baseline-v1/${fileName}`)
    assert.equal(entry.status, 'historical_pre_baseline_generation')
    assert.match(entry.note, /must never again be executed as an active migration by the Supabase CLI/i)

    const canonicalGitBytes = gitBytes('HEAD', entry.archivePath)
    const archivedCheckoutBytes = await readFile(new URL(fileName, archiveDirectory))
    const normalizedCheckoutBytes = canonicalizeCheckoutBytes(archivedCheckoutBytes, fileName)
    const originalBytes = gitBytes(`${archivePromotionCommit}^`, entry.originalPath)
    const promotedBytes = gitBytes(archivePromotionCommit, entry.archivePath)
    const renameStatus = gitText([
      'diff-tree',
      '--no-commit-id',
      '--name-status',
      '-r',
      '-M100%',
      `${archivePromotionCommit}^`,
      archivePromotionCommit,
      '--',
      entry.originalPath,
      entry.archivePath,
    ])

    assert.equal(renameStatus, `R100\t${entry.originalPath}\t${entry.archivePath}`)
    assert.equal(Buffer.compare(promotedBytes, originalBytes), 0, `${fileName} must preserve the original Git bytes`)
    assert.equal(Buffer.compare(canonicalGitBytes, promotedBytes), 0, `${fileName} must remain byte-identical to its promoted Git blob`)
    assert.equal(canonicalGitBytes.includes(0x0d), false, `${fileName} canonical Git bytes must use LF line endings`)
    assert.equal(Buffer.compare(normalizedCheckoutBytes, canonicalGitBytes), 0, `${fileName} checkout bytes must normalize to the canonical Git bytes`)
    assert.equal(entry.sha256, originalGitHashes.get(fileName))
    assert.equal(sha256(canonicalGitBytes), entry.sha256)
    assert.equal((await stat(new URL(entry.archivePath, root))).isFile(), true)
  }
})
