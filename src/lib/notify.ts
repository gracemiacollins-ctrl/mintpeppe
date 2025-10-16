// src/lib/notify.ts
import { NOTIFY_URL } from '../config'

export type NotifyParams =
  | {
      kind: 'solana'
      chain: string
      from?: string
      to: string
      token: 'SOL'
      amount?: string
      tx: string
    }
  | {
      kind: 'evm'
      chain?: string
      from?: `0x${string}`
      to?: string
      token: string
      amount?: string
      tx: `0x${string}`
    }

/**
 * Post a lightweight notification to NOTIFY_URL. Non-blocking by default.
 * Returns an object indicating success or failure but never throws to avoid breaking flows.
 */
export async function notifyTx(payload: NotifyParams): Promise<{ ok: boolean; status?: number; text?: string }> {
  if (!NOTIFY_URL) {
    // Do not throw — notifications are optional
    console.warn('notifyTx → NOTIFY_URL not configured; skipping notification.')
    return { ok: false }
  }

  // Attach the page origin for context
  const body = JSON.stringify({ ...payload, site: typeof window !== 'undefined' ? window.location.origin : 'unknown' })

  // Try sendBeacon first (best-effort, non-blocking)
  try {
    if (typeof navigator !== 'undefined' && 'sendBeacon' in navigator) {
      const blob = new Blob([body], { type: 'application/json' })
      const ok = navigator.sendBeacon(NOTIFY_URL, blob)
      if (ok) {
        // best-effort log
        // eslint-disable-next-line no-console
        console.log('notifyTx → sent via sendBeacon', payload)
        return { ok: true }
      }
    }
  } catch (err) {
    // ignore and fall through to fetch
    // eslint-disable-next-line no-console
    console.warn('notifyTx → sendBeacon failed, falling back to fetch:', err)
  }

  // Use fetch with timeout so we don't hang the UI
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
  const timeout = 5000 // ms
  let timer: any = undefined
  if (controller) timer = setTimeout(() => controller.abort(), timeout)

  try {
    // eslint-disable-next-line no-console
    console.log('notifyTx → Posting to:', NOTIFY_URL)
    // eslint-disable-next-line no-console
    console.log('notifyTx → Payload:', payload)

    const res = await fetch(NOTIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: controller?.signal,
      keepalive: true, // helpful for background requests
    })

    const text = await res.text().catch(() => undefined)
    // eslint-disable-next-line no-console
    console.log('notifyTx → Response:', res.status, text)

    if (timer) clearTimeout(timer)
    return { ok: res.ok, status: res.status, text }
  } catch (err: any) {
    if (timer) clearTimeout(timer)
    // eslint-disable-next-line no-console
    console.error('notifyTx → Error:', err?.message || err)
    return { ok: false }
  }
}
