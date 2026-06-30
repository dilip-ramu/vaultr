'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, BookOpen } from 'lucide-react'

const RELEVANT = ['/suppliers', '/suppliers/directory']

const TABS = [
  { href: '/suppliers',           label: 'Overview',  icon: LayoutDashboard },
  { href: '/suppliers/directory', label: 'Directory', icon: BookOpen },
]

export default function SuppliersHomeTabs() {
  const pathname = usePathname()
  if (!RELEVANT.includes(pathname)) return null

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
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
                  ? { background: 'var(--background)', color: 'var(--text)', boxShadow: '0 1px 3px rgba(0,0,0,.1)' }
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
