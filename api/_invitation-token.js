import { hashInvitationToken } from './_commerce.js'
import { selectRows } from './_supabase.js'

// A resend rotates the current token only after provider acceptance. Keep the
// previously accepted link usable through its original expiry so a late
// provider response cannot silently invalidate an email already in transit.
export async function findInvitationByToken(token) {
  const tokenHash = hashInvitationToken(token)
  const current = await selectRows('order_invitations', { token_hash: `eq.${tokenHash}`, select: '*', limit: 1 })
  if (current[0]) return current[0]
  const previous = await selectRows('order_invitations', { previous_token_hash: `eq.${tokenHash}`, previous_token_expires_at: `gt.${new Date().toISOString()}`, select: '*', limit: 1 })
  return previous[0] ? { ...previous[0], expires_at: previous[0].previous_token_expires_at } : null
}
