import type { Session } from '@supabase/supabase-js'
import { AdminApiError, getAuthorization } from './api'
import type { AdminRole } from './contracts'

export type AdminSessionState = { screen: 'login' | 'denied' | 'shell'; role?: AdminRole; expired?: boolean }

export async function verifyAdminSession(
  session: Session | null,
  clearSession: () => Promise<void>,
  authorize: (token: string) => Promise<{ version: 'v1'; role: AdminRole }> = getAuthorization,
): Promise<AdminSessionState> {
  if (!session?.access_token) return { screen: 'login' }
  try {
    const result = await authorize(session.access_token)
    return { screen: 'shell', role: result.role }
  } catch (error) {
    if (error instanceof AdminApiError && error.status === 403) return { screen: 'denied' }
    await clearSession()
    return { screen: 'login', expired: true }
  }
}
