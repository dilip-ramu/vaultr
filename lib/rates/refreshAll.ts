// One refresh, called from every "fetch" button in the app.
//
// Three separate buttons, each refreshing a third of your portfolio, is three
// chances to look at a stale number and believe it's current. So: whichever one
// you press — the stock price, the currency rate, the metal rate — all three
// refresh together.
//
// The result reports each source SEPARATELY, because "some of it worked" is the
// most common outcome and the least honest thing to round off.

export interface SourceResult {
  ok: boolean
  updated: number
  failed?: string[]
  reason?: string
}

export interface RefreshResult {
  metals: SourceResult
  currencies: SourceResult
  stocks: SourceResult
  allOk: boolean
}

export async function refreshAllRates(): Promise<RefreshResult> {
  const res = await fetch('/api/rates/refresh-all', { method: 'POST' })
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Refresh failed')
  return res.json() as Promise<RefreshResult>
}

/**
 * One line the user can actually act on.
 *
 * Deliberately NOT a cheerful "Updated!" — if the stock feed was down, that is
 * the single most important thing on the screen, and burying it under a green
 * tick is how someone ends up trading on a week-old price.
 */
export function summarise(r: RefreshResult): { message: string; tone: 'success' | 'info' | 'error' } {
  const parts: string[] = []
  if (r.metals.updated) parts.push(`${r.metals.updated} metal rate${r.metals.updated === 1 ? '' : 's'}`)
  if (r.currencies.updated) parts.push(`${r.currencies.updated} currenc${r.currencies.updated === 1 ? 'y' : 'ies'}`)
  if (r.stocks.updated) parts.push(`${r.stocks.updated} stock${r.stocks.updated === 1 ? '' : 's'}`)

  const failed = [
    ...(r.currencies.failed ?? []),
    ...(r.stocks.failed ?? []),
  ]

  if (r.allOk && parts.length) {
    return { message: `Updated ${parts.join(' · ')} ✓`, tone: 'success' }
  }
  if (r.allOk) {
    return { message: 'Nothing to refresh yet — add a stock, currency or metal asset first.', tone: 'info' }
  }

  const done = parts.length ? `Updated ${parts.join(' · ')}. ` : ''
  const couldNot = failed.length
    ? `Could not price: ${failed.join(', ')}.`
    : [r.metals.reason, r.currencies.reason, r.stocks.reason].filter(Boolean).join(' ')

  return { message: `${done}${couldNot}`.trim(), tone: 'error' }
}
