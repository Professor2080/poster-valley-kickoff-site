const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

export class PublicRequestError extends Error {
  constructor(message, status = 400) {
    super(message)
    this.status = status
  }
}

export function sendJson(res, status, payload) {
  res.status(status).setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(payload))
}

export function ensurePost(req, res) {
  if (req.method === 'POST') {
    return true
  }

  res.setHeader('Allow', 'POST')
  sendJson(res, 405, { error: 'Method not allowed.' })
  return false
}

export function ensureGet(req, res) {
  if (req.method === 'GET') {
    return true
  }

  res.setHeader('Allow', 'GET')
  sendJson(res, 405, { error: 'Method not allowed.' })
  return false
}

export function parseBody(body) {
  if (!body) {
    return {}
  }

  if (typeof body === 'string') {
    try {
      return JSON.parse(body)
    } catch {
      throw new PublicRequestError('Invalid request body.')
    }
  }

  if (typeof body === 'object') {
    return body
  }

  throw new PublicRequestError('Invalid request body.')
}

export function readRequestBody(req) {
  try {
    return parseBody(req.body)
  } catch (error) {
    if (error instanceof PublicRequestError) {
      throw error
    }

    if (
      error?.statusCode === 400 &&
      typeof error.message === 'string' &&
      error.message.toLowerCase().includes('invalid json')
    ) {
      throw new PublicRequestError('Invalid request body.')
    }

    throw error
  }
}

export function readText(value, label, maxLength, { required = true } = {}) {
  if (typeof value !== 'string') {
    if (required) {
      throw new PublicRequestError(`${label} is required.`)
    }

    return null
  }

  const trimmed = value.trim()

  if (!trimmed) {
    if (required) {
      throw new PublicRequestError(`${label} is required.`)
    }

    return null
  }

  if (trimmed.length > maxLength) {
    throw new PublicRequestError(`${label} is too long.`)
  }

  return trimmed
}

export function readEmail(value) {
  const email = readText(value, 'Email', 254).toLowerCase()
  const validEmailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

  if (!validEmailPattern.test(email)) {
    throw new PublicRequestError('Please enter a valid email address.')
  }

  return email
}

export function readQuantity(value) {
  const quantity = Number(value)

  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) {
    throw new PublicRequestError('Quantity must be between 1 and 10.')
  }

  return quantity
}

export function readConsent(value, label) {
  if (value !== true) {
    throw new PublicRequestError(label)
  }

  return true
}

export function readOptionalBoolean(value) {
  return value === true
}

export function readCountry(value) {
  const country = readText(value, 'Country', 120)
  const countryPattern = /^[\p{L}\p{M}\s.'()&,-]{2,120}$/u

  if (!countryPattern.test(country)) {
    throw new PublicRequestError('Please select a valid country.')
  }

  return country
}

export function readCountryCode(value) {
  const countryCode = readText(value, 'Country', 2).toUpperCase()

  if (!/^[A-Z]{2}$/.test(countryCode)) {
    throw new PublicRequestError('Please select a valid country.')
  }

  return countryCode
}

function requireSupabaseConfig() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Supabase environment variables are missing.')
  }
}

function buildQuery(params = {}) {
  const entries = Object.entries(params).filter(([, value]) => value !== undefined && value !== null)

  if (entries.length === 0) {
    return ''
  }

  return `?${entries
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&')}`
}

async function supabaseRequest(table, { method, query, body, prefer = 'return=minimal' } = {}) {
  requireSupabaseConfig()

  const url = `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/${table}${buildQuery(query)}`
  const headers = {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
  }

  if (prefer) {
    headers.Prefer = prefer
  }

  const response = await fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  const text = await response.text()

  if (!response.ok) throw new Error(`Supabase ${method} failed with status ${response.status}.`)

  if (!text) {
    return null
  }

  return JSON.parse(text)
}

export async function insertRow(table, row, options = {}) {
  requireSupabaseConfig()

  const baseUrl = `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/${table}`
  const url = options.onConflict
    ? `${baseUrl}?on_conflict=${encodeURIComponent(options.onConflict)}`
    : baseUrl

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: options.onConflict
        ? 'resolution=ignore-duplicates,return=minimal'
        : 'return=minimal',
    },
    body: JSON.stringify(row),
  })

  if (!response.ok) {
    throw new Error(`Supabase insert failed with status ${response.status}.`)
  }
}

export async function createRow(table, row) {
  const result = await supabaseRequest(table, {
    method: 'POST',
    body: row,
    prefer: 'return=representation',
  })

  return Array.isArray(result) ? result[0] : null
}

export async function selectRows(table, query = {}) {
  const result = await supabaseRequest(table, {
    method: 'GET',
    query,
    prefer: undefined,
  })

  return Array.isArray(result) ? result : []
}

export async function updateRows(table, query, row) {
  const result = await supabaseRequest(table, {
    method: 'PATCH',
    query,
    body: row,
    prefer: 'return=representation',
  })

  return Array.isArray(result) ? result : []
}

export function handleEndpointError(res, error) {
  if (error instanceof PublicRequestError) {
    sendJson(res, error.status, { error: error.message })
    return
  }

  console.error('Public endpoint failed.', { name: error instanceof Error ? error.name : 'UnknownError' })
  sendJson(res, 500, { error: 'We could not save your request. Please try again.' })
}

export function readSourcePath(value) {
  const path = readText(value, 'Source path', 240, { required: false })
  if (!path) return ''
  if (!/^\/[A-Za-z0-9/_-]*$/.test(path) || path.includes('//')) throw new PublicRequestError('Source path is invalid.')
  return path
}
