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

export async function insertRow(table, row, options = {}) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Supabase environment variables are missing.')
  }

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
    const detail = await response.text()
    throw new Error(`Supabase insert failed with ${response.status}: ${detail}`)
  }
}

export function handleEndpointError(res, error) {
  if (error instanceof PublicRequestError) {
    sendJson(res, error.status, { error: error.message })
    return
  }

  console.error(error)
  sendJson(res, 500, { error: 'We could not save your request. Please try again.' })
}
