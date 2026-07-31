import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readdir, readFile, stat } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const activeDirectory = new URL('../supabase/migrations/', import.meta.url)
const archiveDirectory = new URL('../supabase/migrations-archive/pre-baseline-v1/', import.meta.url)
const canonicalName = '20260731113000_schema_baseline_v1.sql'
const canonicalSha = 'e4db9505f590ba934543e1ed33e25a8172e66c430596047afe4321d619d8f510'

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

test('the canonical baseline is the only active migration and retains its proven bytes', async () => {
  const activeFiles = (await readdir(activeDirectory)).sort()
  assert.deepEqual(activeFiles, [canonicalName])

  const canonical = await readFile(new URL(canonicalName, activeDirectory))
  assert.equal(canonical.byteLength, 98_654)
  assert.equal(sha256(canonical), canonicalSha)
  assert.equal(canonical.toString('utf8').split(/\r?\n/u).filter((_, index, lines) => index < lines.length - 1 || lines[index] !== '').length, 1_513)
})

test('the pre-baseline manifest exactly binds every archived migration to its original bytes', async () => {
  const manifest = JSON.parse(await readFile(new URL('manifest.json', archiveDirectory), 'utf8'))
  assert.equal(manifest.schemaVersion, 1)
  assert.equal(manifest.status, 'historical_pre_baseline_generation')
  assert.equal(manifest.activeMigrationDirectory, 'supabase/migrations')
  assert.match(manifest.note, /must never be executed as active migrations by the Supabase CLI/i)
  assert.equal(manifest.files.length, 6)

  const archiveFiles = (await readdir(archiveDirectory)).sort()
  assert.deepEqual(
    archiveFiles,
    [...manifest.files.map((entry) => `${entry.version}_${entry.name}.sql`), 'manifest.json'].sort(),
  )

  for (const entry of manifest.files) {
    const fileName = `${entry.version}_${entry.name}.sql`
    assert.equal(entry.originalPath, `supabase/migrations/${fileName}`)
    assert.equal(entry.archivePath, `supabase/migrations-archive/pre-baseline-v1/${fileName}`)
    assert.equal(entry.status, 'historical_pre_baseline_generation')
    assert.match(entry.note, /must never again be executed as an active migration by the Supabase CLI/i)

    const archived = await readFile(new URL(fileName, archiveDirectory))
    assert.equal(sha256(archived), entry.sha256)
    assert.equal((await stat(new URL(entry.archivePath, root))).isFile(), true)
  }
})
