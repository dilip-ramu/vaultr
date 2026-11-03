'use client'

import Link from 'next/link'
import { Check, ArrowRight } from 'lucide-react'
import { orderFlow, type OrderFacts, type StepKey } from '@/lib/orders/flow'

interface Props {
  facts: OrderFacts
  /** Where each step's button goes. A function means "do it here". */
  hrefs: Partial<Record<StepKey, string>>
  onAction: (key: StepKey) => void
}

/**
 * The order page as a flow. One step is current — the first not done — and
 * everything else stays clickable. This marks the path, it does not block it:
 * an order that arrives with the purchase order already placed should not be
 * argued with.
 */
export default function OrderStepRail({ facts, hrefs, onAction }: Props) {
  const steps = orderFlow(facts)

  return (
    <div className="rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5">
        {steps.map((s, i) => {
          const tone = s.done ? 'done' : s.current ? 'current' : 'waiting'
          const bg = tone === 'current' ? 'var(--brand-light)' : 'transparent'
          const body = (
            <>
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 shrink-0 rounded-full flex items-center justify-center text-[10px] font-bold"
                  style={s.done
                    ? { background: 'var(--income)', color: '#fff' }
                    : tone === 'current'
                      ? { background: 'var(--brand)', color: '#fff' }
                      : { background: 'var(--surface-2)', color: 'var(--text-faint)' }}>
                  {s.done ? <Check className="w-3 h-3" /> : i + 1}
                </span>
                <span className="text-[13px] font-bold truncate"
                  style={{ color: tone === 'waiting' ? 'var(--text-muted)' : 'var(--text)' }}>{s.label}</span>
              </div>
              <p className="text-[11px] mt-1.5 leading-snug" style={{ color: 'var(--text-muted)' }}>
                {s.done ? s.doneNote : s.hint}
              </p>
              {s.action && (
                <span className="mt-2 inline-flex items-center gap-1 text-[12px] font-bold"
                  style={{ color: tone === 'waiting' && !s.done ? 'var(--text-muted)' : 'var(--brand)' }}>
                  {s.done ? 'Again' : s.action} <ArrowRight className="w-3 h-3" />
                </span>
              )}
            </>
          )
          const cls = 'text-left p-4 h-full w-full'
          const style = { background: bg, borderRight: i < steps.length - 1 ? '1px solid var(--border)' : undefined }
          const href = hrefs[s.key]
          return href
            ? <Link key={s.key} href={href} className={cls} style={style}>{body}</Link>
            : <button key={s.key} onClick={() => onAction(s.key)} className={cls} style={style}>{body}</button>
        })}
      </div>
    </div>
  )
}
