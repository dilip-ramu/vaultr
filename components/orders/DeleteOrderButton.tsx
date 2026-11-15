'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2, X, Loader2, AlertTriangle } from 'lucide-react'
import { notify } from '@/components/shared/Toast'
import { deleteSummary, type DeletePlan } from '@/lib/orders/deletePlan'

/**
 * Deleting an order.
 *
 * Never a bare confirm. The sheet it is attached to knows about documents,
 * files, invoices, bills and bank entries, and "are you sure?" tells you
 * nothing about which of those are about to disappear. So the button asks
 * the server what would happen and shows the answer, item by item, before
 * anything is touched.
 */
export default function DeleteOrderButton({ orderId, orderNumber }: { orderId: string; orderNumber: string }) {
  const router = useRouter()
  const [plan, setPlan] = useState<DeletePlan | null>(null)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  async function preview() {
    setBusy(true); setOpen(true); setPlan(null)
    try {
      const res = await fetch(`/api/orders/${orderId}`)
      const data = await res.json()
      if (!res.ok) { notify(data.error ?? 'Could not check this order', 'error'); setOpen(false); return }
      setPlan(data.plan as DeletePlan)
    } finally { setBusy(false) }
  }

  async function doDelete() {
    setBusy(true)
    try {
      const res = await fetch(`/api/orders/${orderId}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) {
        // The server works the plan out again at the moment of deleting, so
        // this can refuse even though the preview said yes — somebody may
        // have recorded a payment in between.
        if (data.plan) setPlan(data.plan as DeletePlan)
        notify(data.error ?? 'Could not delete', 'error')
        return
      }
      notify(`Order ${orderNumber} deleted`, 'success')
      router.push('/orders')
      router.refresh()
    } finally { setBusy(false) }
  }

  return (
    <>
      <button onClick={preview}
        className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-bold"
        style={{ background: 'var(--surface-2)', color: 'var(--expense)' }}>
        <Trash2 className="w-4 h-4" /> Delete
      </button>

      {open && (
        <div className="fixed inset-0 z-[80] flex items-end md:items-center justify-center">
          <div className="fixed inset-0 bg-black/40" onClick={() => !busy && setOpen(false)} />
          <div className="relative w-full md:max-w-md rounded-t-3xl md:rounded-2xl p-6 shadow-xl slide-up" style={{ background: 'var(--surface)' }}>
            <div className="flex items-start justify-between gap-3 mb-3">
              <p className="text-base font-extrabold" style={{ color: 'var(--text)' }}>Delete order {orderNumber}?</p>
              <button onClick={() => !busy && setOpen(false)} style={{ color: 'var(--text-faint)' }}><X className="w-4 h-4" /></button>
            </div>

            {!plan ? (
              <p className="text-[13px] py-6 text-center" style={{ color: 'var(--text-muted)' }}>
                <Loader2 className="w-5 h-5 mx-auto mb-2 animate-spin" /> Checking what is attached…
              </p>
            ) : !plan.canDelete ? (
              <>
                <div className="rounded-xl p-3 flex items-start gap-2 text-[13px]" style={{ background: '#FEE2E2', color: '#991B1B' }}>
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>Money has moved against this order, so it cannot be deleted.</span>
                </div>
                <ul className="mt-3 space-y-1">
                  {plan.blockers.map((b, i) => (
                    <li key={i} className="text-[13px]" style={{ color: 'var(--text)' }}>
                      <b>{b.label}</b> <span style={{ color: 'var(--text-muted)' }}>{b.reason}</span>
                    </li>
                  ))}
                </ul>
                <p className="text-[12px] mt-3" style={{ color: 'var(--text-muted)' }}>
                  Take these off the order, or undo the payments, and then it will delete.
                </p>
                <div className="flex justify-end mt-4">
                  <button onClick={() => setOpen(false)} className="px-4 py-2.5 rounded-xl text-sm font-bold" style={{ background: 'var(--surface-2)', color: 'var(--text)' }}>Close</button>
                </div>
              </>
            ) : (
              <>
                <p className="text-[13px]" style={{ color: 'var(--text)' }}>{deleteSummary(plan)}</p>

                {plan.documents.length > 0 && (
                  <ul className="mt-2 space-y-0.5 max-h-40 overflow-y-auto">
                    {plan.documents.map(d => (
                      <li key={d.id} className="text-[12.5px]" style={{ color: 'var(--expense)' }}>− {d.label}</li>
                    ))}
                  </ul>
                )}

                {plan.kept.length > 0 && (
                  <p className="text-[12px] mt-3" style={{ color: 'var(--text-muted)' }}>
                    Kept, and unlinked from this order:{' '}
                    {plan.kept.map(k => `${k.count} ${k.label}${k.count === 1 ? '' : 's'}`).join(', ')}.
                  </p>
                )}

                <p className="text-[11.5px] mt-3" style={{ color: 'var(--text-faint)' }}>This cannot be undone.</p>

                <div className="flex justify-end gap-2 mt-4">
                  <button onClick={() => setOpen(false)} disabled={busy}
                    className="px-4 py-2.5 rounded-xl text-sm font-bold" style={{ background: 'var(--surface-2)', color: 'var(--text)' }}>Cancel</button>
                  <button onClick={doDelete} disabled={busy}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-bold disabled:opacity-60"
                    style={{ background: 'var(--expense)' }}>
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    {busy ? 'Deleting…' : 'Delete'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
