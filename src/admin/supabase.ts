import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

export const hasBrowserSupabaseConfig = Boolean(url && publishableKey)
export const supabase: SupabaseClient | null = hasBrowserSupabaseConfig
  ? createClient(url, publishableKey, { auth: { flowType: 'pkce', detectSessionInUrl: true } })
  : null
