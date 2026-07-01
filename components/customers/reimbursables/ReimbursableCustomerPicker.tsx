'use client'

import { useRouter, useSearchParams } from 'next/navigation'

export interface ReimbursableCustomer {
  id: string
  name: string
  payee_id: string | null   // the payee row linked to this customer
}

interface Props {
  customers: ReimbursableCustomer[]
}

// URL-driven picker so the chosen customer survives navigation between tabs
// (Expenses / Invoices) and refreshes. The page's server component reads the
// `?customer=<id>` param and filters accordingly.
export default function ReimbursableCustomerPicker({ customers }: Props) {
  const router = useRouter()
  const params = useSearchParams()
  const urlSelected = params.get('customer')
  const effective = (urlSelected && customers.some(c => c.id === urlSelected) ? urlSelected : customers[0]?.id) ?? ''

  function pick(id: string) {
    const sp = new URLSearchParams(params.toString())
    if (id) sp.set('customer', id)
    else sp.delete('customer')
    // push (not replace) so the server component re-runs its data-fetches
    // for the new ?customer param — replace alone wasn't refetching, which
    // is why picking Lullabee kept showing the previous customer's invoices.
    router.push(`?${sp.toString()}`)
    router.refresh()
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
      value={effective}
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
