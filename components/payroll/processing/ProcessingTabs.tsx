'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { CalendarClock, History } from 'lucide-react'

const TABS = [
  { href: '/payroll/processing',         label: 'Active',  icon: CalendarClock },
  { href: '/payroll/processing/history', label: 'History', icon: History },
]

export default function ProcessingTabs() {
  const pathname = usePathname()
  // Only show the strip on /payroll/processing or /payroll/processing/history.
  // Drilling into a specific month (/payroll/processing/[id]) hides the strip
  // so the month-detail page keeps its own header chrome.
  const inHome = pathname === '/payroll/processing' || pathname === '/payroll/processing/history'
  if (!inHome) return null

  return (
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
  )
}
