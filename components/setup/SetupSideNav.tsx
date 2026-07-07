'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Tag, Layers, DollarSign, Archive, Mail } from 'lucide-react'

const SECTIONS = [
  { href: '/setup/email',         label: 'Email',           desc: 'Inbox connection & senders', icon: Mail },
  { href: '/setup/categories',    label: 'Categories',      desc: 'Spending categories',        icon: Tag },
  { href: '/setup/account-types', label: 'Account types',   desc: 'Custom account groups',      icon: Layers },
  { href: '/setup/currencies',    label: 'Currencies',      desc: 'Rates & default currency',   icon: DollarSign },
  { href: '/setup/export',        label: 'Export & Backup', desc: 'Download your data',         icon: Archive },
]

export default function SetupSideNav() {
  const pathname = usePathname()
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/')

  return (
    <>
      {/* Desktop / tablet: vertical section list */}
      <nav className="hidden sm:flex flex-col gap-1 w-[240px] shrink-0">
        {SECTIONS.map(s => {
          const active = isActive(s.href)
          const Icon = s.icon
          return (
            <Link
              key={s.href}
              href={s.href}
              className="flex items-start gap-3 px-3 py-2.5 rounded-xl transition-colors"
              style={active
                ? { background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }
                : { border: '1px solid transparent' }}
            >
              <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: active ? 'var(--brand-light)' : 'var(--surface-2)' }}>
                <Icon className="w-4 h-4" style={{ color: active ? 'var(--brand)' : 'var(--text-muted)' }} />
              </span>
              <span className="min-w-0">
                <span className="block text-[13px] font-bold" style={{ color: active ? 'var(--text)' : 'var(--text-muted)' }}>{s.label}</span>
                <span className="block text-[11px]" style={{ color: 'var(--text-faint)' }}>{s.desc}</span>
              </span>
            </Link>
          )
        })}
      </nav>

      {/* Mobile: horizontal scroll chips */}
      <div className="sm:hidden flex gap-1 p-1 rounded-xl overflow-x-auto" style={{ background: 'var(--surface-2)' }}>
        {SECTIONS.map(s => {
          const active = isActive(s.href)
          const Icon = s.icon
          return (
            <Link key={s.href} href={s.href} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors"
              style={active ? { background: 'var(--surface)', color: 'var(--text)', boxShadow: 'var(--shadow)' } : { color: 'var(--text-muted)' }}>
              <Icon className="w-4 h-4" /> {s.label}
            </Link>
          )
        })}
      </div>
    </>
  )
}
