'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Plus } from 'lucide-react'

// "+ New invoice" link that carries the currently-selected customer over to
// the create-invoice flow.
export default function ReimbursablesNewInvoiceLink() {
  const params = useSearchParams()
  const customerId = params.get('customer')
  const href = customerId
    ? `/customers/invoices/reimbursables/new?customer=${customerId}`
    : '/customers/invoices/reimbursables/new'

  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold text-white shrink-0"
      style={{ background: 'var(--brand)' }}
    >
      <Plus className="w-4 h-4" /> New invoice
    </Link>
  )
}
