type Fn = () => void | Promise<void>
const stack: string[] = []
let passed = 0, failed = 0
const fails: string[] = []
const queue: { name: string; fn: Fn }[] = []
const fmt = (n: string, args: unknown[]) => n.replace('%s', String(args[0]))
export function describe(name: string, fn: Fn) { stack.push(name); (fn as () => void)(); stack.pop() }
describe.each = (rows: unknown[]) => (name: string, fn: (...a: unknown[]) => void) =>
  rows.forEach(r => { const args = Array.isArray(r) ? r : [r]; stack.push(fmt(name, args)); fn(...args); stack.pop() })
export function it(name: string, fn: Fn) { queue.push({ name: [...stack, name].join(' › '), fn }) }
it.each = (rows: unknown[]) => (name: string, fn: (...a: unknown[]) => void) =>
  rows.forEach(r => { const args = Array.isArray(r) ? r : [r]; queue.push({ name: [...stack, fmt(name, args)].join(' › '), fn: () => fn(...args) }) })
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
function core(v: unknown, neg: boolean, msg?: string) {
  const bad = (why: string) => { throw new Error(`${msg ? msg + ': ' : ''}${why}`) }
  const chk = (ok: boolean, why: string) => { if (ok === neg) bad(why) }
  return {
    toBe: (e: unknown) => chk(Object.is(v, e), `expected ${JSON.stringify(v)} ${neg ? 'not ' : ''}to be ${JSON.stringify(e)}`),
    toEqual: (e: unknown) => chk(eq(v, e), `expected ${JSON.stringify(v)} ${neg ? 'not ' : ''}to equal ${JSON.stringify(e)}`),
    toContain: (e: unknown) => chk((v as unknown[] | string).includes(e as never), `expected ${JSON.stringify(v)} ${neg ? 'not ' : ''}to contain ${JSON.stringify(e)}`),
    toMatch: (re: RegExp) => chk(re.test(String(v)), `expected ${JSON.stringify(v)} ${neg ? 'not ' : ''}to match ${re}`),
    toHaveLength: (n: number) => chk((v as unknown[]).length === n, `expected length ${(v as unknown[]).length} ${neg ? 'not ' : ''}to be ${n}`),
    toBeTruthy: () => chk(!!v, `expected ${JSON.stringify(v)} ${neg ? 'not ' : ''}to be truthy`),
    toBeNull: () => chk(v === null, `expected ${JSON.stringify(v)} ${neg ? 'not ' : ''}to be null`),
    toBeUndefined: () => chk(v === undefined, `expected ${JSON.stringify(v)} ${neg ? 'not ' : ''}to be undefined`),
    toBeGreaterThan: (n: number) => chk((v as number) > n, `expected ${v} ${neg ? 'not ' : ''}> ${n}`),
    toBeGreaterThanOrEqual: (n: number) => chk((v as number) >= n, `expected ${v} ${neg ? 'not ' : ''}>= ${n}`),
    toBeLessThan: (n: number) => chk((v as number) < n, `expected ${v} ${neg ? 'not ' : ''}< ${n}`),
    toBeCloseTo: (n: number, digits = 2) =>
      chk(Math.abs((v as number) - n) < Math.pow(10, -digits) / 2,
        `expected ${v} ${neg ? 'not ' : ''}close to ${n} (${digits} digits)`),
    toBeLessThanOrEqual: (n: number) => chk((v as number) <= n, `expected ${v} ${neg ? 'not ' : ''}<= ${n}`),
  }
}
export function expect(v: unknown, msg?: string) { return Object.assign(core(v, false, msg), { not: core(v, true, msg) }) }
export async function run() {
  for (const t of queue) { try { await t.fn(); passed++ } catch (e) { failed++; fails.push(`  ✗ ${t.name}\n      ${(e as Error).message}`) } }
  if (fails.length) console.log(fails.join('\n'))
  console.log(`\n  Tests: ${passed} passed, ${failed} failed, ${passed + failed} total`)
  process.exit(failed ? 1 : 0)
}
