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
      className="inline-flex gap-1 p-1 rounded-xl"
      style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
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
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
            style={
              active
                ? { background: 'var(--surface)', color: 'var(--text)', boxShadow: '0 1px 3px rgba(0,0,0,.1)' }
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
