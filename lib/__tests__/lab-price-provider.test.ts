import { describe, it, expect } from 'vitest'
import { fetchPrice, fetchPrices, yahooSymbol, isTransientStatus } from '@/lib/investments/providers/price'

/* eslint-disable @typescript-eslint/no-explicit-any */

// The live price path is the Lab's most failure-prone dependency: an
// undocumented public endpoint, called from a datacenter IP. These tests pin the
// behaviour that matters — bounded retries, no retry on a real answer, a hard
// timeout, and a cap on how many requests go out at once.

const chart = (price: number | null, marketTime = 1_755_000_000) => ({
  ok: true,
  json: async () => ({
    chart: { result: [{ meta: price == null ? {} : { regularMarketPrice: price, currency: 'INR', regularMarketTime: marketTime } }] },
  }),
})

function stubFetch(handler: (url: string, init: any) => Promise<any>) {
  const original = globalThis.fetch
  const calls: string[] = []
  globalThis.fetch = (async (url: any, init: any) => {
    calls.push(String(url))
    return handler(String(url), init)
  }) as never
  return { calls, restore: () => { globalThis.fetch = original } }
}

const noSleep = async () => {}

describe('symbol mapping', () => {
  it('suffixes by exchange and leaves already-suffixed symbols alone', () => {
    expect(yahooSymbol('RELIANCE', 'NSE')).toBe('RELIANCE.NS')
    expect(yahooSymbol('RELIANCE', 'BSE')).toBe('RELIANCE.BO')
    expect(yahooSymbol('RELIANCE.NS', 'BSE')).toBe('RELIANCE.NS')   // explicit wins
    expect(yahooSymbol('  tcs ', 'NSE')).toBe('TCS.NS')
    expect(yahooSymbol('', 'NSE')).toBe(null)
  })

  it('index symbols bypass suffixing — they go through fetchIndexQuote', async () => {
    // ^NSEI has no dot, so yahooSymbol WOULD suffix it. That is why benchmark
    // levels are fetched with fetchIndexQuote, which never rewrites the symbol.
    expect(yahooSymbol('^NSEI', 'NSE')).toBe('^NSEI.NS')
    const f = stubFetch(async () => chart(21000))
    try {
      const { fetchIndexQuote } = await import('@/lib/investments/providers/price')
      const q = await fetchIndexQuote('^NSEI', { sleep: noSleep })
      expect(q!.price).toBe(21000)
      expect(f.calls[0]).toContain(encodeURIComponent('^NSEI'))
      expect(f.calls[0]).not.toContain('.NS')
    } finally { f.restore() }
  })

  it('knows which HTTP statuses are worth retrying', () => {
    expect(isTransientStatus(429)).toBe(true)
    expect(isTransientStatus(503)).toBe(true)
    expect(isTransientStatus(404)).toBe(false)
    expect(isTransientStatus(200)).toBe(false)
  })
})

describe('price fetching — failures must not become prices', () => {
  it('returns a quote with the exchange timestamp', async () => {
    const f = stubFetch(async () => chart(1234.5, 1_755_000_000))
    try {
      const q = await fetchPrice('RELIANCE', 'NSE', { sleep: noSleep })
      expect(q!.price).toBe(1234.5)
      expect(q!.marketTime).toBe(1_755_000_000)
      expect(f.calls[0]).toContain('RELIANCE.NS')
    } finally { f.restore() }
  })

  it('retries once on a rate limit, then succeeds', async () => {
    let n = 0
    const f = stubFetch(async () => {
      n++
      return n === 1 ? { ok: false, status: 429, json: async () => ({}) } : chart(100)
    })
    try {
      const q = await fetchPrice('AAA', 'NSE', { retries: 1, sleep: noSleep })
      expect(q!.price).toBe(100)
      expect(n).toBe(2)
    } finally { f.restore() }
  })

  it('does NOT retry a 404 — an unknown symbol is an answer', async () => {
    let n = 0
    const f = stubFetch(async () => { n++; return { ok: false, status: 404, json: async () => ({}) } })
    try {
      const q = await fetchPrice('NOPE', 'NSE', { retries: 2, sleep: noSleep })
      expect(q).toBe(null)
      expect(n).toBe(1)
    } finally { f.restore() }
  })

  it('gives up after its retry budget and returns null, never a made-up number', async () => {
    let n = 0
    const f = stubFetch(async () => { n++; throw new Error('socket hang up') })
    try {
      const q = await fetchPrice('AAA', 'NSE', { retries: 2, sleep: noSleep })
      expect(q).toBe(null)
      expect(n).toBe(3)
    } finally { f.restore() }
  })

  it('treats a zero or missing price as unknown, not as zero', async () => {
    const f = stubFetch(async () => chart(null))
    try {
      expect(await fetchPrice('AAA', 'NSE', { sleep: noSleep })).toBe(null)
    } finally { f.restore() }
  })

  it('stops retrying once the deadline has passed', async () => {
    let n = 0
    const f = stubFetch(async () => { n++; return { ok: false, status: 503, json: async () => ({}) } })
    try {
      const q = await fetchPrice('AAA', 'NSE', { retries: 5, deadline: Date.now() - 1, sleep: noSleep })
      expect(q).toBe(null)
      expect(n).toBe(1)          // no retry attempted past the deadline
    } finally { f.restore() }
  })
})

describe('batch fetching', () => {
  it('reports exactly which symbols failed and keys quotes by the original symbol', async () => {
    const f = stubFetch(async (url) => (url.includes('BAD') ? { ok: false, status: 404, json: async () => ({}) } : chart(500)))
    try {
      const r = await fetchPrices(
        [{ symbol: 'AAA', exchange: 'NSE' }, { symbol: 'BAD', exchange: 'NSE' }, { symbol: 'BBB', exchange: 'NSE' }],
        { sleep: noSleep },
      )
      expect(Object.keys(r.quotes).sort()).toEqual(['AAA', 'BBB'])
      expect(r.failed).toEqual(['BAD'])
      expect(r.quotes.AAA.price).toBe(500)
    } finally { f.restore() }
  })

  it('de-duplicates repeated symbols', async () => {
    const f = stubFetch(async () => chart(10))
    try {
      await fetchPrices([{ symbol: 'AAA', exchange: 'NSE' }, { symbol: 'aaa', exchange: 'NSE' }], { sleep: noSleep })
      expect(f.calls.length).toBe(1)
    } finally { f.restore() }
  })

  it('keeps at most `concurrency` requests in flight', async () => {
    let inFlight = 0
    let peak = 0
    const f = stubFetch(async () => {
      inFlight++; peak = Math.max(peak, inFlight)
      await new Promise(r => setTimeout(r, 5))
      inFlight--
      return chart(1)
    })
    try {
      const items = Array.from({ length: 9 }, (_, i) => ({ symbol: `S${i}`, exchange: 'NSE' as const }))
      const r = await fetchPrices(items, { concurrency: 3, sleep: noSleep })
      expect(Object.keys(r.quotes)).toHaveLength(9)
      expect(peak).toBeLessThanOrEqual(3)
    } finally { f.restore() }
  })
})
