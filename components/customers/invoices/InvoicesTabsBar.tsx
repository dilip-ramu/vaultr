'use client'

/**
 * Combined tab bar + chip picker for /customers/invoices.
 * Chip semantics differ per tab (see the layout file for the full picture).
 */

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { useTransition, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Users, Loader2, Truck, Receipt, FileText } from 'lucide-react'

interface CustomerRef { id: string; name: string }

interface Props {
  /** Chips shown on the Reimbursables tab — only customers with a payee link. */
  reimbursableCustomers: CustomerRef[]
  /** Chips shown on Couriers + Invoices tabs — every customer in the directory. */
  allCustomers:          CustomerRef[]
}

const TABS = [
  { key: 'couriers',      label: 'Couriers',      href: '/customers/invoices',                icon: Truck },
  { key: 'reimbursables', label: 'Reimbursables', href: '/customers/invoices/reimbursables',  icon: Receipt },
  { key: 'invoices',      label: 'Invoices',      href: '/customers/invoices/list',           icon: FileText },
] as const

// Deterministic chip tint per customer name so badges stay stable across
// reloads. Matches the palette used elsewhere in the app.
const CHIP_HUES = ['#2A7A50', '#3B4AC7', '#B4530F', 'var(--amber)', '#9333EA', '#0891B2', 'var(--expense)', '#EA580C']
function hueFor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0
  return CHIP_HUES[Math.abs(hash) % CHIP_HUES.length]
}

export default function InvoicesTabsBar({ reimbursableCustomers, allCustomers }: Props) {
  const pathname = usePathname()
  const params   = useSearchParams()
  const router   = useRouter()
  const [isPending, startTransition] = useTransition()

  // Which tab is active — derived from the URL path.
  const activeTab = useMemo(() => {
    if (pathname.startsWith('/customers/invoices/reimbursables')) return 'reimbursables'
    if (pathname.startsWith('/customers/invoices/list'))          return 'invoices'
    return 'couriers'
  }, [pathname])

  const chipCustomers = activeTab === 'reimbursables' ? reimbursableCustomers : allCustomers

  const urlSelected = params.get('customer')
  const effective   = urlSelected === 'all'
    ? 'all'
    : (urlSelected && chipCustomers.some(c => c.id === urlSelected)) ? urlSelected : 'all'

  function pick(id: string) {
    const sp = new URLSearchParams(params.toString())
    sp.set('customer', id)
    startTransition(() => {
      router.replace(`?${sp.toString()}`, { scroll: false })
    })
  }

  // Preserve the ?customer=<id> param when switching tabs so the same
  // customer stays picked between Couriers ↔ Reimbursables ↔ Invoices.
  const tabHref = (base: string) => {
    const search = params.toString()
    return search ? `${base}?${search}` : base
  }

  return (
    <div className="space-y-3">
      {/* Tab bar */}
      <div
        className="flex gap-1 p-1 rounded-xl overflow-x-auto"
        style={{ background: 'var(--surface-2)' }}
        role="tablist"
      >
        {TABS.map(t => {
          const active = activeTab === t.key
          const Icon = t.icon
          return (
            <Link
              key={t.key}
              href={tabHref(t.href)}
              role="tab"
              aria-selected={active}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors"
              style={
                active
                  ? { background: 'var(--background)', color: 'var(--text)', boxShadow: 'var(--shadow)' }
                  : { color: 'var(--text-muted)' }
              }
            >
              <Icon className="w-4 h-4" />
              {t.label}
            </Link>
          )
        })}
      </div>

      {/* Chip picker — different customer set per tab. */}
      {chipCustomers.length === 0 ? (
        <p className="text-xs px-3 py-1.5 rounded-lg" style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}>
          {activeTab === 'reimbursables'
            ? 'No reimbursable customers yet — mark a customer reimbursable in the Directory first.'
            : 'No customers yet — add one in the Directory.'}
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-1.5" role="tablist">
          <Chip
            active={effective === 'all'}
            onClick={() => pick('all')}
            label="All"
            hue="#6B7280"
            icon={<Users className="w-3.5 h-3.5" />}
            dim={isPending && effective !== 'all'}
          />
          {chipCustomers.map(c => (
            <Chip
              key={c.id}
              active={effective === c.id}
              onClick={() => pick(c.id)}
              label={c.name}
              hue={hueFor(c.name)}
              initial={c.name[0]?.toUpperCase() ?? '?'}
              dim={isPending && effective !== c.id}
            />
          ))}
          {isPending && (
            <span className="flex items-center gap-1 text-xs px-2" style={{ color: 'var(--text-muted)' }}>
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> loading…
            </span>
          )}
        </div>
      )}
    </div>
  )
}

/** Same visual language as AccountChipPicker (transactions):
 *   ─ Chunky rounded-xl chip with border-2
 *   ─ 28px icon box (rounded-lg, not circle) with the customer's initial or icon
 *   ─ Small colored dot before the name for the accent
 *   ─ Soft surface-2 background when unselected; tinted when active
 */
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
      className={`flex items-center gap-2 px-3 py-2 rounded-xl border-2 transition-all whitespace-nowrap ${dim ? 'opacity-50' : ''}`}
      style={
        active
          ? { borderColor: hue, backgroundColor: `${hue}10`, boxShadow: '0 1px 3px rgba(0,0,0,.08)' }
          : { borderColor: 'transparent', backgroundColor: 'var(--surface-2)' }
      }
    >
      {/* Icon box — square-ish with a tinted background, like AccountChipPicker */}
      <div
        className="w-7 h-7 rounded-lg flex items-center justify-center text-sm shrink-0 font-bold text-white"
        style={{ background: hue }}
      >
        {icon ?? initial}
      </div>
      {/* Accent dot + label */}
      <div className="flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: hue }} />
        <span
          className="text-sm font-medium"
          style={{ color: active ? 'var(--text)' : 'var(--text-muted)' }}
        >
          {label}
        </span>
      </div>
    </button>
  )
}
