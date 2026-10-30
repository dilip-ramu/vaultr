'use client'

// The frame around every invoice flow.
//
// One job: at any moment, make it obvious what you are making, how far through
// you are, and how to get back. The old tabs answered none of those — you could
// be three screens into a reimbursement invoice with nothing on the page saying
// so, and no way back that did not lose your place.
//
// Back is never dead. On the first step it leaves the flow and returns to the
// chooser, because the commonest mistake is picking the wrong kind of invoice,
// and the commonest reaction is to press Back.

import Link from 'next/link'
import { ArrowLeft, Check } from 'lucide-react'
import {
  FLOWS, backHref, stepHref, stepIndex, canGoTo, progressWords, type FlowId,
} from '@/lib/customers/invoiceFlows'

export default function FlowShell({
  flow, step, query = {}, children,
}: {
  flow: FlowId
  step: string
  /** Context the flow is carrying — customer, batch — kept across steps. */
  query?: Record<string, string>
  children: React.ReactNode
}) {
  const def = FLOWS[flow]
  const here = stepIndex(flow, step)
  const current = def.steps[here] ?? def.steps[0]
  const progress = progressWords(flow, step)

  return (
    <div className="w-full px-4 md:px-8 py-6 space-y-5">
      <div>
        <Link href={backHref(flow, step, query)}
          className="inline-flex items-center gap-1.5 text-[12.5px] font-bold"
          style={{ color: 'var(--text-faint)' }}>
          <ArrowLeft className="w-3.5 h-3.5" />
          {here <= 0 ? 'All invoice types' : `Back to ${def.steps[here - 1].label}`}
        </Link>

        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mt-1">
          <h1 className="text-xl md:text-2xl font-extrabold tracking-tight" style={{ color: 'var(--text)' }}>
            {def.label}
          </h1>
          {progress && (
            <span className="text-[12px] font-bold" style={{ color: 'var(--text-faint)' }}>{progress}</span>
          )}
        </div>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>{current.hint}</p>
      </div>

      {/* The steps. Anything already reached stays clickable, so correcting a
          mistake is one click rather than starting again. */}
      {def.steps.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          {def.steps.map((s, i) => {
            const done = i < here
            const active = i === here
            const reachable = canGoTo(flow, step, s.key)
            const body = (
              <span className="inline-flex items-center gap-1.5 text-[12.5px] font-bold px-3 py-1.5 rounded-xl"
                style={active
                  ? { background: 'var(--brand)', color: '#fff' }
                  : {
                      border: '1px solid var(--border)',
                      background: 'var(--surface)',
                      color: reachable ? 'var(--text-muted)' : 'var(--text-faint)',
                      opacity: reachable ? 1 : 0.6,
                    }}>
                {done
                  ? <Check className="w-3.5 h-3.5" style={{ color: 'var(--income)' }} />
                  : <span className="text-[11px]">{i + 1}</span>}
                {s.label}
              </span>
            )
            return reachable && !active
              ? <Link key={s.key} href={stepHref(flow, s.key, query)}>{body}</Link>
              : <span key={s.key}>{body}</span>
          })}
        </div>
      )}

      {children}
    </div>
  )
}

/**
 * The bar at the bottom of a step that is not the last one.
 *
 * Deliberately not called "Next": a step that writes nothing should say what
 * continuing does. The caller passes the words.
 */
export function FlowFooter({
  flow, step, query = {}, continueTo, continueLabel, note, disabled,
}: {
  flow: FlowId
  step: string
  query?: Record<string, string>
  continueTo: string
  continueLabel: string
  note?: string
  disabled?: boolean
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
      <div className="min-w-0">
        {note && <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>{note}</p>}
      </div>
      <div className="flex items-center gap-2">
        <Link href={backHref(flow, step, query)}
          className="text-sm font-bold px-4 py-2.5 rounded-xl"
          style={{ border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
          Back
        </Link>
        {disabled ? (
          <span className="text-sm font-bold px-4 py-2.5 rounded-xl opacity-40"
            style={{ background: 'var(--brand)', color: '#fff' }}>
            {continueLabel}
          </span>
        ) : (
          <Link href={stepHref(flow, continueTo, query)}
            className="text-white text-sm font-bold px-4 py-2.5 rounded-xl"
            style={{ background: 'var(--brand)' }}>
            {continueLabel}
          </Link>
        )}
      </div>
    </div>
  )
}
