// Shared server-side Claude caller for the Investments module.
//
// Matches the existing app convention (see lib/email/extract.ts): a plain fetch
// to the Anthropic Messages API with x-api-key + anthropic-version, no SDK
// dependency. It provides three things the module needs:
//
//   1. Web search — analysis has to be grounded in CURRENT, citable sources
//      (NSE/BSE/SEBI/RBI/filings), not the model's training data. We enable
//      Anthropic's server-side web_search tool and harvest the citations so
//      every figure can be traced (brief §16).
//   2. Structured JSON out — with defensive extraction, because a recommendation
//      the UI can't parse is worse than none.
//   3. CLASSIFIED FAILURE (correctness pass, item 9) — the single most important
//      change here. Previously every failure collapsed into "no data", which the
//      recommender then turned into "evidence is too thin, do not buy". That is
//      an investment conclusion invented out of an HTTP 429. Callers now get a
//      `failure` with a kind they can act on: a transport problem must DEFER the
//      decision, never conclude anything about the company.
//
// Retries are OPT-IN (retries defaults to 0) so Phase 1's behaviour is
// unchanged; the Lab passes a retry budget because its cycles are autonomous.
//
// NOTHING here executes trades or touches broker APIs. It reads and reasons.

import type { Source } from './types'

const ANALYSIS_MODEL = process.env.INVEST_ANALYSIS_MODEL || 'claude-sonnet-4-5'
const FAST_MODEL = process.env.INVEST_FAST_MODEL || 'claude-haiku-4-5-20251001'

export const MODELS = { analysis: ANALYSIS_MODEL, fast: FAST_MODEL }

/**
 * Why a research call produced nothing. Deliberately NOT overlapping with
 * INSUFFICIENT_DATA, which is an analytical judgement about a company and is
 * decided elsewhere (recommend.ts) from real evidence.
 */
export type ResearchErrorKind =
  | 'RATE_LIMITED'          // 429 — back off and retry later
  | 'TIMEOUT'               // request exceeded its deadline
  | 'PROVIDER_ERROR'        // 5xx / overloaded / network / malformed response
  | 'AUTHENTICATION_ERROR'  // missing or rejected API key
  | 'PARSE_ERROR'           // answered, but not with usable JSON
  | 'NO_DATA_FOUND'         // answered and parsed, but genuinely returned nothing
  | 'BAD_REQUEST'           // 4xx we caused — not retryable, needs a code fix

export interface ResearchFailure {
  kind: ResearchErrorKind
  message: string
  status?: number
  /** True when trying again later could plausibly succeed. */
  retryable: boolean
  attempts: number
}

export function isTransport(kind: ResearchErrorKind): boolean {
  return kind === 'RATE_LIMITED' || kind === 'TIMEOUT' || kind === 'PROVIDER_ERROR'
    || kind === 'AUTHENTICATION_ERROR' || kind === 'BAD_REQUEST'
}

class ResearchError extends Error {
  kind: ResearchErrorKind
  status?: number
  retryable: boolean
  constructor(kind: ResearchErrorKind, message: string, status?: number) {
    super(message)
    this.kind = kind
    this.status = status
    this.retryable = kind === 'RATE_LIMITED' || kind === 'TIMEOUT' || kind === 'PROVIDER_ERROR'
  }
}

function apiKey(): string {
  const k = process.env.ANTHROPIC_API_KEY
  if (!k) throw new ResearchError('AUTHENTICATION_ERROR', 'ANTHROPIC_API_KEY is not set')
  return k
}

interface AnthropicBlock {
  type: string
  text?: string
  citations?: { type?: string; url?: string; title?: string }[]
  content?: { type?: string; url?: string; title?: string }[]
}
interface AnthropicResponse { content?: AnthropicBlock[]; stop_reason?: string }

export interface CallOpts {
  system?: string
  prompt: string
  model?: string
  maxTokens?: number
  /** Enable Anthropic server-side web search (grounded, citable). */
  webSearch?: boolean
  /** Cap web searches so a single analysis can't run away. */
  maxUses?: number
  /** Extra attempts after a retryable failure. 0 (default) = Phase-1 behaviour. */
  retries?: number
  /** Abort a single attempt after this long. Unset = no client-side deadline. */
  timeoutMs?: number
  /** Epoch ms after which we stop retrying even if attempts remain. */
  deadline?: number
  /** Injectable for tests — must resolve after roughly `ms`. */
  sleep?: (ms: number) => Promise<void>
}

const defaultSleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

function classifyStatus(status: number): ResearchErrorKind {
  if (status === 429) return 'RATE_LIMITED'
  if (status === 401 || status === 403) return 'AUTHENTICATION_ERROR'
  if (status === 408 || status === 504) return 'TIMEOUT'
  if (status >= 500) return 'PROVIDER_ERROR'
  return 'BAD_REQUEST'
}

/** Backoff for attempt n (0-based), honouring a Retry-After header when present. */
export function backoffMs(attempt: number, retryAfterSeconds?: number | null): number {
  if (retryAfterSeconds != null && Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    return Math.min(30_000, Math.round(retryAfterSeconds * 1000))
  }
  return Math.min(20_000, 750 * Math.pow(2, attempt))
}

async function attemptCall(opts: CallOpts): Promise<AnthropicResponse> {
  const body: Record<string, unknown> = {
    model: opts.model || ANALYSIS_MODEL,
    max_tokens: opts.maxTokens ?? 4096,
    messages: [{ role: 'user', content: opts.prompt }],
  }
  if (opts.system) body.system = opts.system
  if (opts.webSearch) {
    body.tools = [{ type: 'web_search_20250305', name: 'web_search', max_uses: opts.maxUses ?? 6 }]
  }

  const key = apiKey()
  const controller = opts.timeoutMs ? new AbortController() : null
  const timer = controller && opts.timeoutMs
    ? setTimeout(() => controller.abort(), opts.timeoutMs)
    : null

  let res: Response
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller?.signal,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const aborted = e instanceof Error && (e.name === 'AbortError' || /abort/i.test(msg))
    throw new ResearchError(aborted ? 'TIMEOUT' : 'PROVIDER_ERROR', aborted ? `Request aborted after ${opts.timeoutMs}ms` : `Network error reaching the Anthropic API: ${msg}`)
  } finally {
    if (timer) clearTimeout(timer)
  }

  if (!res.ok) {
    let detail = ''
    try { detail = await res.text() } catch { /* ignore */ }
    const retryAfter = Number(res.headers?.get?.('retry-after') ?? NaN)
    const err = new ResearchError(classifyStatus(res.status), `Anthropic API ${res.status}: ${detail.slice(0, 300)}`, res.status)
    ;(err as ResearchError & { retryAfter?: number }).retryAfter = Number.isFinite(retryAfter) ? retryAfter : undefined
    throw err
  }

  try {
    return await res.json() as AnthropicResponse
  } catch (e) {
    throw new ResearchError('PROVIDER_ERROR', `Anthropic API returned an unreadable body: ${e instanceof Error ? e.message : String(e)}`)
  }
}

/** Call the API, retrying only genuinely transient failures. */
async function callAnthropic(opts: CallOpts): Promise<{ response: AnthropicResponse; attempts: number }> {
  const maxAttempts = Math.max(1, 1 + (opts.retries ?? 0))
  const sleep = opts.sleep ?? defaultSleep
  let last: ResearchError | null = null

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const response = await attemptCall(opts)
      return { response, attempts: attempt + 1 }
    } catch (e) {
      last = e instanceof ResearchError ? e : new ResearchError('PROVIDER_ERROR', e instanceof Error ? e.message : String(e))
      const more = attempt < maxAttempts - 1
      const wait = backoffMs(attempt, (last as ResearchError & { retryAfter?: number }).retryAfter)
      // A retry is only affordable if the BACKOFF PLUS A WHOLE FURTHER ATTEMPT
      // finishes before the deadline. Checking `now < deadline` was not enough:
      // it happily started a 45s attempt with 2s left, which is exactly how a
      // request ends up being killed by the platform instead of returning.
      const nextAttemptCost = wait + (opts.timeoutMs ?? 0)
      const affordable = opts.deadline == null || Date.now() + nextAttemptCost < opts.deadline
      if (!last.retryable || !more || !affordable) break
      await sleep(wait)
    }
  }
  throw Object.assign(last ?? new ResearchError('PROVIDER_ERROR', 'Unknown failure'), { attempts: maxAttempts })
}

/** All text blocks joined. */
function collectText(resp: AnthropicResponse): string {
  return (resp.content ?? [])
    .filter(b => b.type === 'text' && typeof b.text === 'string')
    .map(b => b.text as string)
    .join('\n')
}

/** Every citable URL the model actually used, de-duped. */
function collectSources(resp: AnthropicResponse): Source[] {
  const out = new Map<string, Source>()
  const add = (url?: string, title?: string) => {
    if (!url) return
    if (!out.has(url)) out.set(url, { title: title || url, url })
  }
  for (const b of resp.content ?? []) {
    for (const c of b.citations ?? []) add(c.url, c.title)
    // web_search_tool_result blocks carry the raw results
    if (b.type === 'web_search_tool_result') for (const r of b.content ?? []) add(r.url, r.title)
  }
  return Array.from(out.values())
}

/** First balanced JSON object/array in a string, or null. */
export function extractJson<T = unknown>(text: string): T | null {
  // Prefer a fenced block if present.
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const candidates: string[] = []
  if (fenced) candidates.push(fenced[1])
  const first = Math.min(...['{', '['].map(c => { const i = text.indexOf(c); return i === -1 ? Infinity : i }))
  if (Number.isFinite(first)) {
    const openCh = text[first]
    const closeCh = openCh === '{' ? '}' : ']'
    const last = text.lastIndexOf(closeCh)
    if (last > first) candidates.push(text.slice(first, last + 1))
  }
  for (const c of candidates) {
    try { return JSON.parse(c) as T } catch { /* try next */ }
  }
  return null
}

export interface ResearchResult<T> {
  data: T | null
  sources: Source[]
  raw: string
  /** Human-readable summary of what went wrong (kept for Phase-1 callers). */
  error?: string
  /** Machine-readable classification. Absent on success. */
  failure?: ResearchFailure
}

function toFailure(e: unknown): ResearchFailure {
  if (e instanceof ResearchError) {
    return {
      kind: e.kind,
      message: e.message,
      status: e.status,
      retryable: e.retryable,
      attempts: (e as ResearchError & { attempts?: number }).attempts ?? 1,
    }
  }
  return { kind: 'PROVIDER_ERROR', message: e instanceof Error ? e.message : String(e), retryable: true, attempts: 1 }
}

/**
 * Ask Claude to research something and return STRUCTURED JSON + the sources it
 * cited. On failure returns { data: null, failure } — and the CALLER MUST look
 * at failure.kind before drawing any conclusion: a PROVIDER_ERROR means "we do
 * not know", which is not the same as "the evidence is thin" (brief §15).
 */
export async function researchJson<T>(opts: CallOpts): Promise<ResearchResult<T>> {
  try {
    const { response, attempts } = await callAnthropic({ webSearch: true, maxTokens: 4096, ...opts })
    const raw = collectText(response)
    const sources = collectSources(response)
    if (!raw.trim()) {
      const failure: ResearchFailure = { kind: 'NO_DATA_FOUND', message: 'The model returned no text.', retryable: true, attempts }
      return { data: null, sources, raw, error: failure.message, failure }
    }
    const data = extractJson<T>(raw)
    if (data == null) {
      const failure: ResearchFailure = { kind: 'PARSE_ERROR', message: 'Could not parse structured output', retryable: true, attempts }
      return { data: null, sources, raw, error: failure.message, failure }
    }
    return { data, sources, raw }
  } catch (e) {
    const failure = toFailure(e)
    return { data: null, sources: [], raw: '', error: failure.message, failure }
  }
}

/** Plain text answer (no JSON contract). Used sparingly. */
export async function ask(opts: CallOpts): Promise<{ text: string; sources: Source[]; error?: string; failure?: ResearchFailure }> {
  try {
    const { response } = await callAnthropic(opts)
    return { text: collectText(response), sources: collectSources(response) }
  } catch (e) {
    const failure = toFailure(e)
    return { text: '', sources: [], error: failure.message, failure }
  }
}
