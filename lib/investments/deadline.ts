// Request budgets (Deploy #4 reliability fix). PURE.
//
// THE BUG THIS EXISTS TO KILL
//
// A serverless request has a hard wall. An Anthropic call with server-side web
// search routinely takes 15–45 seconds, and the analysis path makes two of them
// back to back. With no client-side deadline the second call was still running
// when Vercel's 60s limit hit, so the platform destroyed the request and the
// browser got a 504 — no result, no error we could explain, no record of why.
//
// A 504 is the worst possible outcome: the work was done and thrown away, and
// the caller cannot tell a slow network from a broken key from a real answer.
//
// The rule now: measure the wall, and never start work that cannot finish before
// it. If there is not enough time left, stop cleanly and say so — a truthful
// "could not finish, try again" beats a request that vanishes.

/** Vercel's ceiling for these routes (see `export const maxDuration`). */
export const ROUTE_MAX_MS = 60_000

/** Held back for cold start, request parsing, persistence and the response. */
export const SAFETY_MS = 7_000

/**
 * THE MINIMUM VIABLE RESEARCH STAGE (Deploy #6).
 *
 * A qualitative or fundamentals call runs Anthropic's server-side web_search up
 * to six times and then writes ~4k output tokens, inside ONE non-streaming HTTP
 * response. Measured in production that is 25–60 seconds, commonly 30–45.
 *
 * The previous value — 18 seconds — was a guess at "enough to be worth trying",
 * and it was well below what the call actually needs. The result was a system
 * that gated correctly and then started work it could not finish: with ~19s left
 * it would grant a 16s timeout to a 30s call and abort it. The research was
 * performed and billed by Anthropic, then discarded by us.
 *
 * So the gate is now the honest question: is there enough time for the call to
 * FINISH, not merely to start? Below this, the stage is not attempted at all —
 * the cycle persists where it got to and returns in_progress.
 *
 * Consequence, stated plainly: with a ~48s usable budget this means ONE research
 * stage per invocation. That is the real arithmetic of 60-second requests and
 * 30–45-second research calls, not a limitation we invented.
 */
export const MIN_RESEARCH_STAGE_MS = 40_000

/** No single upstream call may be given more than this. */
export const MAX_CALL_MS = 45_000

/** Time set aside so a call that uses its whole timeout still leaves room to
 *  persist the result and respond. */
export const CALL_RESERVE_MS = 3_000

export interface RequestBudget {
  readonly startedAt: number
  readonly deadline: number
  /** Milliseconds left before the deadline (never negative). */
  remaining(): number
  elapsed(): number
  /** Is there room to start something expected to take `ms`? */
  enough(ms: number): boolean
  /** Timeout to hand a single upstream call, leaving room to finish up. */
  callTimeout(max?: number): number
  /** How many retries are affordable for a call of this size. */
  retriesFor(callMs: number): number
}

export function createBudget(opts: {
  totalMs?: number
  now?: number
  reserveMs?: number
} = {}): RequestBudget {
  const startedAt = opts.now ?? Date.now()
  const total = Math.max(1_000, (opts.totalMs ?? ROUTE_MAX_MS) - (opts.reserveMs ?? SAFETY_MS))
  const deadline = startedAt + total

  const remaining = () => Math.max(0, deadline - Date.now())
  return {
    startedAt,
    deadline,
    remaining,
    elapsed: () => Date.now() - startedAt,
    enough: (ms: number) => remaining() >= ms,
    callTimeout: (max = MAX_CALL_MS) => Math.max(0, Math.min(max, remaining() - CALL_RESERVE_MS)),
    retriesFor: (callMs: number) => {
      const left = remaining()
      // Only retry if a SECOND full attempt would also finish in time.
      if (left >= callMs * 2 + CALL_RESERVE_MS) return left >= callMs * 3 + CALL_RESERVE_MS ? 2 : 1
      return 0
    },
  }
}

/** A budget that never expires — for callers with no request wall (tests, CLI). */
export function unlimitedBudget(now = Date.now()): RequestBudget {
  return {
    startedAt: now,
    deadline: Number.POSITIVE_INFINITY,
    remaining: () => Number.POSITIVE_INFINITY,
    elapsed: () => Date.now() - now,
    enough: () => true,
    callTimeout: (max = MAX_CALL_MS) => max,
    retriesFor: () => 2,
  }
}

// ── Timing instrumentation ──────────────────────────────────────────────────
//
// Every stage of the analysis records how long it took, so a slow path can be
// diagnosed from the response instead of guessed at. Names only — never prompts,
// keys or payloads.

export type Timings = Record<string, number>

export interface Stopwatch {
  timings: Timings
  time<T>(name: string, fn: () => Promise<T>): Promise<T>
  mark(name: string, ms: number): void
  total(): number
}

export function stopwatch(now: () => number = Date.now): Stopwatch {
  const startedAt = now()
  const timings: Timings = {}
  return {
    timings,
    async time<T>(name: string, fn: () => Promise<T>): Promise<T> {
      const t0 = now()
      try {
        return await fn()
      } finally {
        timings[name] = (timings[name] ?? 0) + (now() - t0)
      }
    },
    mark(name: string, ms: number) { timings[name] = (timings[name] ?? 0) + ms },
    total() { return now() - startedAt },
  }
}
