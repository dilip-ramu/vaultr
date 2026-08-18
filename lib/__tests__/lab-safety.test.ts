import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

// A standing guarantee, checked by the build rather than by memory: the Lab is
// paper-only. If anyone ever adds broker execution, these tests fail loudly.

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next' || entry === '.git') continue
    const full = join(dir, entry)
    const s = statSync(full)
    if (s.isDirectory()) walk(full, out)
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full)
  }
  return out
}

const ROOT = process.cwd()
// Shipped source only. The test files themselves quote the forbidden strings in
// order to look for them, so scanning them would always self-trip.
const FILES = [...walk(join(ROOT, 'lib')), ...walk(join(ROOT, 'app')), ...walk(join(ROOT, 'components'))]
  .filter(f => !f.includes(`${join('lib', '__tests__')}`))
const SOURCE = FILES.map(f => ({ f, text: readFileSync(f, 'utf8') }))

describe('no real-money execution exists anywhere (item 15)', () => {
  it('does not talk to any broker API', () => {
    const brokerHosts = [
      'api.kite.trade', 'kite.zerodha', 'api.upstox', 'api.angelbroking',
      'smartapi.angelbroking', 'api.icicidirect', 'hdfcsec.com/api',
      'api.groww', 'api.dhan.co', 'api.fyers',
    ]
    const hits = SOURCE.filter(s => brokerHosts.some(h => s.text.includes(h)))
    expect(hits.map(h => h.f)).toEqual([])
  })

  it('never writes to the order table', () => {
    // inv_orders exists as a v109 safety scaffold and must stay unwritten.
    const writers = SOURCE.filter(s =>
      /from\('inv_orders'\)\s*\.\s*(insert|upsert|update)/.test(s.text))
    expect(writers.map(w => w.f)).toEqual([])
  })

  it('has no order-placement helper of any kind', () => {
    const forbidden = /\b(placeOrder|submitOrder|executeOrder|sendOrderToBroker|placeRealOrder)\b/
    const hits = SOURCE.filter(s => forbidden.test(s.text))
    expect(hits.map(h => h.f)).toEqual([])
  })

  it('the Lab UI offers no path to a real trade', () => {
    const labUi = SOURCE.filter(s => s.f.includes('components/investments/lab/'))
    expect(labUi.length).toBeGreaterThan(0)
    for (const { f, text } of labUi) {
      expect(`${f}: ${/broker|real money|live order/i.test(text) && !/no broker|not.*real money|paper/i.test(text)}`)
        .toBe(`${f}: false`)
    }
  })

  it('states plainly in the UI that this is paper money', () => {
    const client = SOURCE.find(s => s.f.endsWith('components/investments/lab/LabClient.tsx'))!
    expect(client.text).toMatch(/Paper portfolio/i)
    expect(client.text).toMatch(/10,00,000/)
    expect(client.text).toMatch(/no broker/i)
  })
})

describe('the Lab dashboard is cheap to open (item 19)', () => {
  it('the read model never calls the AI or the price feed', () => {
    const overview = SOURCE.find(s => s.f.endsWith('lib/investments/lab/overview.ts'))!
    expect(overview.text).not.toMatch(/researchJson|getFundamentals|analyzeSymbol/)
    expect(overview.text).not.toMatch(/fetchPrices?\(|fetchIndexQuote|query1\.finance\.yahoo/)
  })

  it('the read-only Lab API routes only read', () => {
    const readOnly = ['overview', 'decisions', 'trades', 'income', 'thesis']
    for (const name of readOnly) {
      const route = SOURCE.find(s => s.f.endsWith(join('app', 'api', 'investments', 'lab', name, 'route.ts')))
      expect(`${name}:${Boolean(route)}`).toBe(`${name}:true`)
      expect(route!.text).not.toMatch(/export async function (POST|PATCH|DELETE|PUT)/)
    }
  })
})

describe('the immutable journals are never updated from application code', () => {
  it('no code path issues an UPDATE against trades, decisions or dividends', () => {
    const tables = ['lab_trades', 'lab_decisions', 'lab_dividends', 'inv_recommendations']
    for (const t of tables) {
      const pattern = new RegExp(`from\\('${t}'\\)\\s*\\.\\s*update`)
      const hits = SOURCE.filter(s => pattern.test(s.text))
      expect(`${t}: ${hits.map(h => h.f).join(', ')}`).toBe(`${t}: `)
    }
  })
})
