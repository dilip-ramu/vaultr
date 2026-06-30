'use client'

import { useRouter, useSearchParams } from 'next/navigation'

export interface ReimbursableCustomer {
  id: string
  name: string
  payee_id: string | null   // the payee row linked to this customer
}

interface Props {
  customers: ReimbursableCustomer[]
  selectedId: string | null
}

// URL-driven picker so the chosen customer survives navigation between tabs
// (Expenses / Invoices) and refreshes. The page's server component reads the
// `?customer=<id>` param and filters accordingly.
export default function ReimbursableCustomerPicker({ customers, selectedId }: Props) {
  const router = useRouter()
  const params = useSearchParams()

  function pick(id: string) {
    const sp = new URLSearchParams(params.toString())
    if (id) sp.set('customer', id)
    else sp.delete('customer')
    router.replace(`?${sp.toString()}`)
  }

  if (customers.length === 0) {
    return (
      <p className="text-xs px-3 py-1.5 rounded-lg" style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}>
        No reimbursable customers yet — link a payee to a customer first.
      </p>
    )
  }

  if (customers.length === 1) {
    return (
      <p className="text-xs px-3 py-1.5 rounded-lg" style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}>
        Showing <span className="font-semibold" style={{ color: 'var(--text)' }}>{customers[0].name}</span>
      </p>
    )
  }

  return (
    <select
      value={selectedId ?? customers[0]?.id ?? ''}
      onChange={e => pick(e.target.value)}
      className="px-3 py-1.5 rounded-lg text-sm border outline-none"
      style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text)' }}
    >
      {customers.map(c => (
        <option key={c.id} value={c.id}>{c.name}</option>
      ))}
    </select>
  )
}
