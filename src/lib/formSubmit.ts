export type FormSubmitResult =
  | {
      ok: true
    }
  | {
      ok: false
      message: string
    }

type ErrorResponse = {
  error?: string
}

export async function submitJson(endpoint: string, payload: unknown): Promise<FormSubmitResult> {
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    const data = (await response.json().catch(() => null)) as ErrorResponse | null

    if (!response.ok) {
      return {
        ok: false,
        message: data?.error ?? 'We could not save your request. Please try again.',
      }
    }

    return { ok: true }
  } catch {
    return {
      ok: false,
      message: 'We could not reach the server. Please try again in a moment.',
    }
  }
}
