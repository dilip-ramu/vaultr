'use client'

// One row of tabs across the whole chit module.
//
// These used to be sub-items in the sidebar, which meant expanding a menu to
// reach them. A chit has four places worth going to, so they belong at the top
// of the page where they can be seen and clicked.
//
// Admins is owner-only. It is not rendered at all for a chit admin — and the
// page itself redirects them, and the database refuses the rows, so hiding the
// tab is convenience, not the lock.

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutGrid, Layers, Users, ShieldCheck, type LucideIcon } from 'lucide-react'
import { visibleTabs, isActiveTab } from '@/lib/chit/tabs'

// Which rule lights which tab lives in lib/chit/tabs.ts, where it can be
// tested. This file only draws them.
const ICON: Record<string, LucideIcon> = {
  '/chit': LayoutGrid,
  '/chit/groups': Layers,
  '/chit/members': Users,
  '/chit/admins': ShieldCheck,
}

export default function ChitTabs({ isOwner }: { isOwner: boolean }) {
  const pathname = usePathname() ?? ''
  const tabs = visibleTabs(pathname, isOwner)
  if (tabs.length === 0) return null

  return (
    <div className="w-full px-4 md:px-8 pt-5 -mb-2">
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1">
        {tabs.map(t => {
          const active = isActiveTab(t.href, pathname)
          const Icon = ICON[t.href] ?? LayoutGrid
          return (
            <Link key={t.href} href={t.href}
              aria-current={active ? 'page' : undefined}
              className="flex items-center gap-1.5 shrink-0 text-[13px] font-bold px-3.5 py-2 rounded-xl transition-colors"
              style={active
                ? { background: 'var(--brand)', color: '#fff' }
                : { color: 'var(--text-muted)', border: '1px solid var(--border)', background: 'var(--surface)' }}>
              <Icon className="w-4 h-4" />
              {t.label}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
