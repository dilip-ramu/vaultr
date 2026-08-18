// Shared server-side Claude caller for the Investments module.
//
// Matches the existing app convention (see lib/email/extract.ts): a plain fetch
// to the Anthropic Messages API with x-api-key + anthropic-version, no SDK
// dependency. Adds two things that module needs:
//
//   1. Web search — analysis has to be grounded in CURRENT, citable sources
//      (NSE/BSE/SEBI/RBI/filings), not the model's training data. We enable
//      Anthropic's server-side web_search tool and harvest the citations so
//      every figure can be traced (brief §16).
//   2. Structured JSON out — with defensive extraction, because a recommendation
//      the UI can't parse is worse than none.
//
// NOTHING here executes trades or touches broker APIs. It reads and reasons.

import type { Source } from './types'

const ANALYSIS_MODEL = process.env.INVEST_ANALYSIS_MODEL || 'claude-sonnet-4-5'
const FAST_MODEL = process.env.INVEST_FAST_MODEL || 'claude-haiku-4-5-20251001'

export const MODELS = { analysis: ANALYSIS_MODEL, fast: FAST_MODEL }

function apiKey(): string {
  const k = process.env.ANTHROPIC_API_KEY
  if (!k) throw new Error('ANTHROPIC_API_KEY not set')
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
}

async function callAnthropic(opts: CallOpts): Promise<AnthropicResponse> {
  const body: Record<string, unknown> = {
    model: opts.model || ANALYSIS_MODEL,
    max_tokens: opts.maxTokens ?? 4096,
    messages: [{ role: 'user', content: opts.prompt }],
  }
  if (opts.system) body.system = opts.system
  if (opts.webSearch) {
    body.tools = [{ type: 'web_search_20250305', name: 'web_search', max_uses: opts.maxUses ?? 6 }]
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey(),
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    let detail = ''
    try { detail = await res.text() } catch { /* ignore */ }
    throw new Error(`Anthropic API ${res.status}: ${detail.slice(0, 300)}`)
  }
  return res.json() as Promise<AnthropicResponse>
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
  error?: string
}

/**
 * Ask Claude to research something and return STRUCTURED JSON + the sources it
 * cited. On any failure returns { data: null, error } — callers treat a null as
 * "insufficient data", never as a zero (brief §15). The prompt must describe the
 * exact JSON shape wanted; we validate only that it parsed.
 */
export async function researchJson<T>(opts: CallOpts): Promise<ResearchResult<T>> {
  try {
    const resp = await callAnthropic({ webSearch: true, maxTokens: 4096, ...opts })
    const raw = collectText(resp)
    const sources = collectSources(resp)
    const data = extractJson<T>(raw)
    return { data, sources, raw, error: data ? undefined : 'Could not parse structured output' }
  } catch (e) {
    return { data: null, sources: [], raw: '', error: e instanceof Error ? e.message : 'Claude call failed' }
  }
}

/** Plain text answer (no JSON contract). Used sparingly. */
export async function ask(opts: CallOpts): Promise<{ text: string; sources: Source[]; error?: string }> {
  try {
    const resp = await callAnthropic(opts)
    return { text: collectText(resp), sources: collectSources(resp) }
  } catch (e) {
    return { text: '', sources: [], error: e instanceof Error ? e.message : 'Claude call failed' }
  }
}
