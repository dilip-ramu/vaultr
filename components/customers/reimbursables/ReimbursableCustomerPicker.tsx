'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'
import { Users, Loader2 } from 'lucide-react'

export interface ReimbursableCustomer {
  id: string
  name: string
  payee_id: string | null   // the payee row linked to this customer
}

interface Props {
  customers: ReimbursableCustomer[]
}

/** Deterministic tint per customer name so the chip badge is stable across
 *  reloads without a DB avatar_url column. */
const CHIP_HUES = ['#2A7A50', '#3B4AC7', '#B4530F', '#B45309', '#9333EA', '#0891B2', '#DC2626', '#EA580C']
function hueFor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0
  return CHIP_HUES[Math.abs(hash) % CHIP_HUES.length]
}

/**
 * Chip picker with pending state — this is the Next 15 recommended pattern
 * for router-driven filters:
 *
 *   startTransition(() => { router.replace(newUrl, { scroll: false }) })
 *
 * That makes React treat the navigation as a low-priority update. isPending
 * flips true the instant you click and stays true until the server component
 * finishes rendering the new data. The chips show a spinner + dim tint the
 * whole time so the UI feels responsive instead of "did anything happen?".
 *
 * router.replace (not push) so the back button doesn't stack up every
 * customer-switch as a separate history entry.
 */
export default function ReimbursableCustomerPicker({ customers }: Props) {
  const router = useRouter()
  const params = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const urlSelected = params.get('customer')

  const effective = urlSelected === 'all'
    ? 'all'
    : (urlSelected && customers.some(c => c.id === urlSelected)) ? urlSelected : (customers[0]?.id ?? '')

  function pick(id: string) {
    const sp = new URLSearchParams(params.toString())
    sp.set('customer', id)
    startTransition(() => {
      router.replace(`?${sp.toString()}`, { scroll: false })
    })
  }

  if (customers.length === 0) {
    return (
      <p className="text-xs px-3 py-1.5 rounded-lg" style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}>
        No reimbursable customers yet — link a payee to a customer first.
      </p>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5" role="tablist">
      <Chip
        active={effective === 'all'}
        onClick={() => pick('all')}
        label="All"
        hue="#6B7280"
        icon={<Users className="w-3.5 h-3.5" />}
        dim={isPending && effective !== 'all'}
      />
      {customers.map(c => {
        const hue = hueFor(c.name)
        return (
          <Chip
            key={c.id}
            active={effective === c.id}
            onClick={() => pick(c.id)}
            label={c.name}
            hue={hue}
            initial={c.name[0]?.toUpperCase() ?? '?'}
            dim={isPending && effective !== c.id}
          />
        )
      })}
      {isPending && (
        <span className="flex items-center gap-1 text-xs px-2" style={{ color: 'var(--text-muted)' }}>
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> loading…
        </span>
      )}
    </div>
  )
}

function Chip({
  active, onClick, label, hue, initial, icon, dim,
}: {
  active:  boolean
  onClick: () => void
  label:   string
  hue:     string
  initial?: string
  icon?:   React.ReactNode
  dim:     boolean
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`flex items-center gap-2 px-2.5 py-1.5 rounded-full border text-sm font-medium transition-all whitespace-nowrap ${dim ? 'opacity-50' : ''}`}
      style={{
        borderColor: active ? hue : 'var(--border)',
        background:  active ? `${hue}18` : 'var(--surface)',
        color:       active ? hue : 'var(--text)',
      }}
    >
      <span
        className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
        style={{ background: hue }}
      >
        {icon ?? initial}
      </span>
      {label}
    </button>
  )
}
