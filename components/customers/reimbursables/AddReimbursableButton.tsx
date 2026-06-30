'use client'

import { useState } from 'react'
import { UserPlus } from 'lucide-react'
import AddReimbursableCustomerModal from './AddReimbursableCustomerModal'

interface Customer { id: string; name: string }

export default function AddReimbursableButton({ candidates }: { candidates: Customer[] }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border shrink-0"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text)' }}
      >
        <UserPlus className="w-4 h-4" /> Add reimbursable customer
      </button>
      {open && <AddReimbursableCustomerModal candidates={candidates} onClose={() => setOpen(false)} />}
    </>
  )
}
