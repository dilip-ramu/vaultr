'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ArrowLeftRight, Inbox } from 'lucide-react'

const TABS = [
  { href: '/transactions',       label: 'Transactions',      icon: ArrowLeftRight },
  { href: '/transactions/fetch', label: 'Fetch Transactions', icon: Inbox },
]

export default function TransactionsPageTabs() {
  const pathname = usePathname()
  const isActive = (href: string) =>
    href === '/transactions'
      ? pathname === href
      : pathname === href || pathname.startsWith(href + '/')

  return (
    <div
      className="flex gap-1 p-1 rounded-xl overflow-x-auto"
      style={{ background: 'var(--surface-2)' }}
      role="tablist"
    >
      {TABS.map(t => {
        const active = isActive(t.href)
        const Icon = t.icon
        return (
          <Link
            key={t.href}
            href={t.href}
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
  )
}
