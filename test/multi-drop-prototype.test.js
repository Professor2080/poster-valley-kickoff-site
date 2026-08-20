import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)

async function source(path) {
  return readFile(new URL(path, root), 'utf8')
}

test('prototype fixtures cover multiple creators, live drops and scalable targets', async () => {
  const fixtures = await source('src/data/drops.ts')

  assert.ok((fixtures.match(/status: 'live'/g) ?? []).length >= 3)
  assert.match(fixtures, /status: 'target-reached'/)
  assert.match(fixtures, /status: 'coming-next'/)
  assert.match(fixtures, /status: 'made-possible'/)
  assert.match(fixtures, /status: 'unavailable'/)
  assert.match(fixtures, /target: 8/)
  assert.match(fixtures, /creatorId: 'poster-valley'/)
  assert.match(fixtures, /creatorId: 'prototype-creator-one'/)
  assert.match(fixtures, /creatorId: 'prototype-creator-two'/)
  assert.match(fixtures, /creatorId: 'prototype-creator-three'/)
})

test('public progress wording reflects qualified reserved-copy quantity', async () => {
  const [meter, fixtures] = await Promise.all([
    source('src/components/PrintMeter.tsx'),
    source('src/data/drops.ts'),
  ])

  assert.match(meter, /copies reserved/)
  assert.doesNotMatch(meter, /collectors joined/)
  assert.match(fixtures, /Join the drop — no payment yet/)
})

test('join and update prototype interactions do not call public mutation endpoints', async () => {
  const [join, updates] = await Promise.all([
    source('src/components/DropInterestForm.tsx'),
    source('src/components/WaitlistCTA.tsx'),
  ])

  for (const file of [join, updates]) {
    assert.doesNotMatch(file, /submitJson/)
    assert.doesNotMatch(file, /fetch\s*\(/)
    assert.doesNotMatch(file, /\/api\//)
  }
  assert.match(join, /No reservation, customer record, email, order or payment was created/)
  assert.match(updates, /It sends no email and stores no visitor data/)
})

test('live drop gallery is manual, scroll-snapped and keyboard operable', async () => {
  const [gallery, styles] = await Promise.all([
    source('src/components/LiveDropsGallery.tsx'),
    source('src/index.css'),
  ])

  assert.match(gallery, /ArrowLeft/)
  assert.match(gallery, /ArrowRight/)
  assert.match(gallery, /tabIndex=\{0\}/)
  assert.match(gallery, /onKeyDown=\{handleKeyDown\}/)
  assert.doesNotMatch(gallery, /setInterval|autoplay/i)
  assert.match(styles, /scroll-snap-type:\s*x mandatory/)
  assert.match(styles, /scroll-snap-align:\s*start/)
  assert.match(styles, /prefers-reduced-motion:\s*reduce/)
})

test('detail template maps fixture states to honest actions', async () => {
  const detail = await source('src/components/DesignDetailPage.tsx')

  assert.match(detail, /status === 'live'.*Join the drop/)
  assert.match(detail, /status === 'target-reached'.*View confirmed status/)
  assert.match(detail, /status === 'coming-next'.*Get notified/)
  assert.match(detail, /status === 'made-possible'.*View the story/)
  assert.doesNotMatch(detail, /status === 'unavailable'.*(Buy|Reserve|Join the drop)/)
})
