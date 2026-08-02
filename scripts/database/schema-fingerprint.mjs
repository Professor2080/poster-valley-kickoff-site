import { createHash } from 'node:crypto'

export function normalizeNewlines(value) {
  return typeof value === 'string' ? value.replace(/\r\n|\r/gu, '\n') : value
}

export function fingerprintTextItems(items) {
  if (!Array.isArray(items) || items.some((item) => typeof item !== 'string')) {
    throw new TypeError('Schema fingerprint items must be strings.')
  }
  return createHash('sha256')
    .update(Buffer.from(items.map(normalizeNewlines).join('\n'), 'utf8'))
    .digest('hex')
}
