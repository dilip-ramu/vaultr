// Strategy versioning (brief §14). Every decision and trade records the
// MODEL_VERSION that produced it, so we can later tell whether a methodology
// change actually improved results. NEVER overwrite an old version's meaning —
// bump the version and describe the change.

import { DEFAULT_WEIGHTS } from '../scoring'

export const MODEL_VERSION = '1.0'

export interface MethodologyDescriptor {
  version: string
  summary: string
  scoreWeights: Record<string, number>
  notes: string[]
}

export const METHODOLOGY: MethodologyDescriptor = {
  version: MODEL_VERSION,
  summary: 'Phase-1 fundamentals-first scoring + portfolio-aware, regime-adjusted decisions, run as an autonomous paper portfolio with realistic Indian delivery-equity costs.',
  scoreWeights: DEFAULT_WEIGHTS,
  notes: [
    'Fundamentals-led; technicals are supporting only.',
    'Data-confidence gate: thin evidence => no buy (INSUFFICIENT_DATA).',
    'Portfolio-aware: best stock is not always the best buy (concentration).',
    'Cash is a legitimate position; no forced deployment.',
    'No leverage, shorting, derivatives; NSE/BSE delivery equity only.',
  ],
}
