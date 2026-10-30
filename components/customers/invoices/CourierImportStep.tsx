'use client'

// Step 1 of the courier flow: get the consignments in.
//
// The old import screen finished on a card offering "View Batch" and "Back to
// Dashboard" — neither of which is the next thing anybody wanted. Here,
// finishing an import moves you on, and if there is already work waiting you
// can step over this entirely.

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import ImportPageClient from '@/components/recoverables/import/ImportPageClient'
import { stepHref } from '@/lib/customers/invoiceFlows'

export default function CourierImportStep({
  pendingCount, pendingCustomers,
}: { pendingCount: number; pendingCustomers: number }) {
  const router = useRouter()
  const onward = stepHref('courier', 'build')

  return (
    <div className="space-y-4">
      {pendingCount > 0 && (
        <div className="rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3"
          style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
          <div className="min-w-0">
            <p className="text-sm font-bold" style={{ color: 'var(--text)' }}>
              {pendingCount} consignment{pendingCount === 1 ? '' : 's'} already waiting to be billed
            </p>
            <p className="text-[12.5px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
              Across {pendingCustomers} customer{pendingCustomers === 1 ? '' : 's'}. You only need to
              import again if this sheet is new.
            </p>
          </div>
          <Link href={onward}
            className="inline-flex items-center gap-1.5 text-white text-sm font-bold px-4 py-2.5 rounded-xl shrink-0"
            style={{ background: 'var(--brand)' }}>
            Skip to the invoice <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      )}

      {/* Finishing an import carries you on, instead of ending on a card with
          nowhere to go. */}
      <ImportPageClient onImported={() => router.push(onward)} />

      {pendingCount === 0 && (
        <p className="text-[12px] leading-relaxed" style={{ color: 'var(--text-faint)' }}>
          Nothing is waiting to be billed yet, so this step is where a courier invoice starts.
          If the customers in your sheet do not match the ones in Inex, set their CSV alias in
          the customer record first — otherwise the invoice is created without their address
          and GSTIN.
        </p>
      )}
    </div>
  )
}
