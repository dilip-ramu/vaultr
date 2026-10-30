// The three ways an invoice gets made, as one model.
//
// WHY THIS EXISTS
//
// Invoices had three different shapes of work hiding behind a tab bar, and the
// tabs did not match the work. "Couriers" was a batch screen, "Reimbursables"
// was a queue of expenses that were not invoices at all, and "Invoices" was a
// list. Making a reimbursement invoice meant sorting expenses on one tab, then
// leaving, finding a different tab, pressing New, and choosing from a popup —
// a job split across three screens with no thread between them.
//
// So the page stops being tabs and becomes a question: what are you making?
// Each answer runs one flow, start to finish, and the flow carries you into the
// invoice rather than leaving you to go and find it.
//
// REVERSIBLE BY CONSTRUCTION
//
// The step lives in the URL. That is not a detail — it is what makes the
// browser Back button, the in-page Back button and a bookmarked half-finished
// invoice all behave the same way. Nothing here is a wizard holding you
// hostage: every step you have already reached stays clickable, and nothing is
// billed until the last one.
//
// Pure. No React, no database — just which steps exist and which you may go to.

export type FlowId = 'courier' | 'reimbursable' | 'direct'

export interface FlowStep {
  key: string
  label: string
  /** One line under the step, in the words of the job rather than the schema. */
  hint: string
  /**
   * A step you may pass straight through. Courier import is the case: one CSV
   * is usually billed to several customers, so the second invoice from a batch
   * should not ask you to upload it again.
   */
  skippable?: boolean
}

export interface Flow {
  id: FlowId
  label: string
  /** What this makes, said plainly on the chooser. */
  blurb: string
  /** When to pick it. The sentence that stops somebody choosing wrong. */
  when: string
  steps: FlowStep[]
}

// ONE OF THESE MIXES, AND THE CHOOSER HAS TO SAY WHICH.
//
// A reimbursable invoice is not only expenses: the same invoice carries
// salaries, whole courier invoices folded in as single lines, your own typed
// lines and deductions. A courier invoice is the opposite — one fixed format,
// one line per AWB, nothing else allowed on it.
//
// That is the real difference between the two, and it is the thing somebody
// standing at this screen needs to know before they pick. Describing the
// middle one as "expenses" would send people to the wrong flow and strand them
// there, which is most of what was wrong with the tabs.
export const FLOWS: Record<FlowId, Flow> = {
  courier: {
    id: 'courier',
    label: 'Courier invoice',
    blurb: 'Bill a customer for their share of consignments. One line per AWB, in the courier format.',
    when: 'You have a courier CSV, or already imported one. Nothing else goes on this invoice.',
    steps: [
      { key: 'import', label: 'Consignments', hint: 'Upload a courier CSV, or use AWBs already imported', skippable: true },
      { key: 'build', label: 'Invoice', hint: 'Pick the AWBs, set markup and tax, check it, send it' },
    ],
  },
  reimbursable: {
    id: 'reimbursable',
    label: 'Reimbursable invoice',
    blurb: 'Expenses you carried, plus salaries, courier charges and your own lines — all on one invoice.',
    when: 'You paid for things on their behalf. This is the one that can mix everything.',
    steps: [
      { key: 'sort', label: 'Sort expenses', hint: 'Give each expense a billing category so it can be invoiced' },
      { key: 'build', label: 'Invoice', hint: 'Add salaries, courier charges, your own lines and deductions, then finalise' },
    ],
  },
  direct: {
    id: 'direct',
    label: 'Plain invoice',
    blurb: 'A GST invoice with lines you type yourself. Nothing pulled in from anywhere.',
    when: 'A one-off bill that is not a courier sheet and not money you are claiming back.',
    steps: [
      { key: 'build', label: 'Invoice', hint: 'Customer, company, lines, tax — then create' },
    ],
  },
}

export const FLOW_ORDER: FlowId[] = ['courier', 'reimbursable', 'direct']

export function isFlowId(v: string | null | undefined): v is FlowId {
  return v === 'courier' || v === 'reimbursable' || v === 'direct'
}

/** The step a flow opens on. */
export function firstStep(flow: FlowId): string {
  return FLOWS[flow].steps[0].key
}

/** The step a URL is asking for, or the first one when it asks for nonsense. */
export function resolveStep(flow: FlowId, requested: string | null | undefined): string {
  const steps = FLOWS[flow].steps
  return steps.some(s => s.key === requested) ? (requested as string) : steps[0].key
}

export function stepIndex(flow: FlowId, key: string): number {
  return FLOWS[flow].steps.findIndex(s => s.key === key)
}

/** The step after this one, or null at the end of the flow. */
export function nextStep(flow: FlowId, key: string): string | null {
  const i = stepIndex(flow, key)
  const steps = FLOWS[flow].steps
  return i >= 0 && i < steps.length - 1 ? steps[i + 1].key : null
}

/** The step before this one, or null at the start. */
export function prevStep(flow: FlowId, key: string): string | null {
  const i = stepIndex(flow, key)
  return i > 0 ? FLOWS[flow].steps[i - 1].key : null
}

/**
 * Where Back goes.
 *
 * At the first step of a flow, Back leaves the flow and returns to the chooser
 * — a dead Back button at the top of a wizard is how people end up stuck on a
 * screen they picked by mistake.
 */
export function backHref(flow: FlowId, key: string, query: Record<string, string> = {}): string {
  const prev = prevStep(flow, key)
  return prev ? stepHref(flow, prev, query) : '/customers/invoices'
}

/** The URL for one step, keeping whatever context the flow is carrying. */
export function stepHref(flow: FlowId, key: string, query: Record<string, string> = {}): string {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== '') sp.set(k, v)
  }
  // Only the first step needs no ?step=, which keeps the common URL short and
  // makes the flow's own address the obvious thing to bookmark.
  if (key !== firstStep(flow)) sp.set('step', key)
  const qs = sp.toString()
  return `/customers/invoices/${flow}${qs ? `?${qs}` : ''}`
}

/**
 * Which steps a person may jump to from here.
 *
 * Backwards, always — correcting a mistake must never mean starting again.
 * Forwards, only one at a time, because a later step is built from what the
 * earlier one produced and skipping into it shows an empty screen with no
 * explanation. A skippable step is the exception: it may be stepped over.
 */
export function reachableSteps(flow: FlowId, current: string): string[] {
  const steps = FLOWS[flow].steps
  const here = stepIndex(flow, current)
  if (here < 0) return [steps[0].key]

  const out: string[] = []
  for (let i = 0; i < steps.length; i++) {
    if (i <= here) { out.push(steps[i].key); continue }
    if (i === here + 1) { out.push(steps[i].key); continue }
    // Anything further ahead is reachable only if every step between here and
    // it can be stepped over.
    const between = steps.slice(here + 1, i)
    if (between.every(s => s.skippable)) out.push(steps[i].key)
  }
  return out
}

export function canGoTo(flow: FlowId, current: string, target: string): boolean {
  return reachableSteps(flow, current).includes(target)
}

/** "Step 2 of 2", for somebody who wants to know how much is left. */
export function progressWords(flow: FlowId, key: string): string {
  const steps = FLOWS[flow].steps
  const i = stepIndex(flow, key)
  if (steps.length < 2 || i < 0) return ''
  return `Step ${i + 1} of ${steps.length}`
}
