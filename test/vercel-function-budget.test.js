import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import test from 'node:test'

async function filesBelow(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(entries.map((entry) => entry.isDirectory() ? filesBelow(join(directory, entry.name)) : [join(directory, entry.name)]))
  return nested.flat()
}

test('Vercel deployment stays within the twelve-function Hobby budget', async () => {
  const handlers = []
  for (const path of await filesBelow('api')) {
    if (!path.endsWith('.js')) continue
    if (/\bexport\s+default\b/.test(await readFile(path, 'utf8'))) handlers.push(relative('.', path).replaceAll('\\', '/'))
  }
  handlers.sort()
  assert.equal(handlers.length, 12)
  assert.ok(handlers.includes('api/admin/reporting.js'))
  assert.ok(handlers.includes('api/admin/status.js'))
  for (const retired of ['api/admin/report.js', 'api/admin/export.js', 'api/admin/authorization.js', 'api/admin/delivery-status.js']) assert.equal(handlers.includes(retired), false)
})

test('legacy read-only status URLs remain compatibility rewrites, not functions', async () => {
  const config = JSON.parse(await readFile('vercel.json', 'utf8'))
  assert.deepEqual(config.rewrites.slice(0, 2), [
    { source: '/api/admin/authorization', destination: '/api/admin/status?operation=authorization' },
    { source: '/api/admin/delivery-status', destination: '/api/admin/status?operation=delivery' },
  ])
})
