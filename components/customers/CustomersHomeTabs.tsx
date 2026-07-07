'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, BookOpen } from 'lucide-react'

// Only show on /customers and /customers/directory. Deeper customer pages
// (commission, etc.) shouldn't see this strip.
const RELEVANT = ['/customers', '/customers/directory']

const TABS = [
  { href: '/customers',           label: 'Overview',  icon: LayoutDashboard },
  { href: '/customers/directory', label: 'Directory', icon: BookOpen },
]

export default function CustomersHomeTabs() {
  const pathname = usePathname()
  if (!RELEVANT.includes(pathname)) return null

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 pt-6">
      <div
        className="flex gap-1 p-1 rounded-xl overflow-x-auto"
        style={{ background: 'var(--surface-2)' }}
        role="tablist"
      >
        {TABS.map(t => {
          const active = pathname === t.href
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
    </div>
  )
}
