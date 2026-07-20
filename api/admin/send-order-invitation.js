import { createHash, timingSafeEqual } from 'node:crypto'
import { ensurePost, sendJson } from '../_supabase.js'

function requestSecret(req) {
  const value = req.headers?.['x-admin-action-secret']
  return Array.isArray(value) ? value[0] : value
}

function secretsMatch(provided, configured) {
  if (typeof provided !== 'string' || !provided || !configured) return false
  return timingSafeEqual(createHash('sha256').update(provided).digest(), createHash('sha256').update(configured).digest())
}

// The legacy header-secret sender cannot provide the authenticated actor,
// transaction history, or provider-idempotency guarantees required by A3.
// It remains as an authenticated compatibility tombstone so old callers fail
// closed instead of bypassing the durable admin action contract.
export default async function handler(req, res) {
  if (!ensurePost(req, res)) return
  const configuredSecret = process.env.ADMIN_ACTION_SECRET
  if (!configuredSecret) return sendJson(res, 503, { success: false, error: 'ADMIN_ACTION_SECRET is not configured.' })
  if (!secretsMatch(requestSecret(req), configuredSecret)) return sendJson(res, 401, { success: false, error: 'Unauthorized.' })
  sendJson(res, 410, {
    success: false,
    error: 'This legacy invitation sender is disabled. Use the authenticated Admin invitation action.',
  })
}
