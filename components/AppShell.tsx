'use client'

import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard, Wallet, ArrowLeftRight, Tag, Receipt,
  Users, Settings, Plus, LogOut, ChevronRight, ChevronDown,
  X, Menu, PanelLeftClose, PanelLeftOpen, Layers, DollarSign, Search,
  Moon, Sun, Target, RefreshCw, Lightbulb, FileText,
  Banknote, UserSquare, CalendarClock, History,
  Building2, BookOpen, CheckCheck,
  ArrowDownUp, ReceiptText, Globe, Archive, Mail, Scale,
  CalendarRange, CreditCard,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'
import type { Profile } from '@/lib/types'
import { ToastProvider } from '@/components/shared/Toast'
import { ConfirmProvider } from '@/components/shared/ConfirmDialog'
import GlobalSearch from '@/components/shared/GlobalSearch'

const TransactionForm = dynamic(() => import('./transactions/TransactionForm'), { ssr: false })

interface AppShellProps {
  user: User
  profile: Profile | null
  children: React.ReactNode
}

// ── Nav data structure ──────────────────────────────────────────────────────

type SubItem = { href: string; label: string; icon: React.ComponentType<{ className?: string }> }
type NavItem = { href: string; label: string; icon: React.ComponentType<{ className?: string }>; subItems?: SubItem[] }
type NavSection = { id: string; label?: string; items: NavItem[] }

const navSections: NavSection[] = [
  {
    id: 'main',
    items: [
      { href: '/dashboard',    label: 'Dashboard',    icon: LayoutDashboard },
      { href: '/accounts',     label: 'Accounts',     icon: Wallet },
      { href: '/transactions', label: 'Transactions', icon: ArrowLeftRight },
      { href: '/profitability', label: 'Profitability', icon: Scale },
      { href: '/forecast', label: 'Forecast', icon: CalendarRange },
      { href: '/cards', label: 'Cards', icon: CreditCard },
    ],
  },
  {
    id: 'business',
    label: 'Business',
    items: [
      {
        href: '/customers', label: 'Customers', icon: Users,
        subItems: [
          { href: '/customers/directory',    label: 'Directory',   icon: BookOpen },
          { href: '/recoverables/invoices',  label: 'Invoices',    icon: FileText },
          { href: '/recoverables/tds',       label: 'TDS',         icon: Receipt },
          { href: '/customers/commission',   label: 'Incoming',    icon: DollarSign },
          { href: '/recoverables/settings',  label: 'Settings',    icon: Settings },
        ],
      },
      {
        href: '/suppliers', label: 'Suppliers', icon: Building2,
        subItems: [
          { href: '/suppliers/directory',             label: 'Directory',     icon: BookOpen },
          { href: '/suppliers/invoices',              label: 'Invoices',      icon: FileText },
          { href: '/suppliers/invoices?recurring=true', label: 'Subscriptions', icon: RefreshCw },
          { href: '/suppliers/settled',               label: 'Settled',       icon: CheckCheck },
          { href: '/suppliers/categories',            label: 'Categories',    icon: Tag },
        ],
      },
      {
        href: '/contrast', label: 'Contrast', icon: Globe,
        subItems: [
          { href: '/contrast',         label: 'Expenses',       icon: ArrowDownUp },
          { href: '/contrast/invoice', label: 'Invoice',        icon: ReceiptText },
          { href: '/contrast/history', label: 'History',        icon: History },
        ],
      },
    ],
  },
  {
    id: 'payroll',
    label: 'Payroll',
    items: [
      { href: '/payroll/processing', label: 'Processing',    icon: CalendarClock },
      { href: '/payroll/staff',      label: 'Staff',         icon: UserSquare },
      { href: '/payroll/slips',      label: 'Salary Slips',  icon: FileText },
      { href: '/payroll/history',    label: 'History',       icon: History },
    ],
  },
  {
    id: 'email',
    label: 'Email',
    items: [
      {
        href: '/inbox/email-documents', label: 'Documents', icon: Mail,
        subItems: [
          { href: '/settings/email-integration', label: 'Email Setup', icon: Settings },
        ],
      },
    ],
  },
  {
    id: 'finance',
    label: 'Finance',
    items: [
      { href: '/budgets', label: 'Budgets', icon: Target },
    ],
  },
  {
    id: 'tools',
    label: 'Tools',
    items: [
      { href: '/insights',      label: 'Insights',       icon: Lightbulb },
      { href: '/downloads',     label: 'Export & Backup',icon: Archive },
      { href: '/categories',    label: 'Categories',     icon: Tag },
      { href: '/account-types', label: 'Account Types',  icon: Layers },
      { href: '/currencies',    label: 'Currencies',     icon: DollarSign },
    ],
  },
]

// ── Item active-state helper ────────────────────────────────────────────────

function isItemActive(href: string, hasSubItems: boolean, pathname: string) {
  if (hasSubItems) return pathname === href
  return pathname === href || pathname.startsWith(href + '/')
}

// ── Single nav link ─────────────────────────────────────────────────────────

function NavLink({
  href, label, icon: Icon, isActive, indent = false, collapsed, onClick,
}: {
  href: string; label: string; icon: React.ComponentType<{ className?: string }>
  isActive: boolean; indent?: boolean; collapsed: boolean; onClick?: () => void
}) {
  return (
    <Link
      href={href}
      title={collapsed ? label : undefined}
      onClick={onClick}
      className={`flex items-center gap-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
        collapsed ? 'justify-center px-2.5' : indent ? 'pl-6 pr-2.5' : 'px-2.5'
      }`}
      style={{
        backgroundColor: isActive ? 'var(--brand-light)' : 'transparent',
        color: isActive ? 'var(--brand)' : 'var(--text-muted)',
      }}
    >
      <Icon className={`shrink-0 ${indent ? 'w-[14px] h-[14px]' : 'w-[17px] h-[17px]'}`} />
      {!collapsed && <span className="flex-1 truncate">{label}</span>}
      {!collapsed && isActive && !indent && <ChevronRight className="w-3 h-3 shrink-0" />}
    </Link>
  )
}

// ── Section renderer ────────────────────────────────────────────────────────

function SidebarSection({
  section, pathname, collapsed, sectionOpen, onToggle, onItemClick,
}: {
  section: NavSection; pathname: string; collapsed: boolean
  sectionOpen: boolean; onToggle: () => void; onItemClick?: () => void
}) {
  return (
    <div>
      {/* Section header */}
      {section.label && !collapsed && (
        <button
          onClick={onToggle}
          className="w-full flex items-center justify-between px-2.5 pt-3 pb-1 group"
        >
          <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-faint)' }}>
            {section.label}
          </span>
          {sectionOpen
            ? <ChevronDown className="w-3 h-3" style={{ color: 'var(--text-faint)' }} />
            : <ChevronRight className="w-3 h-3" style={{ color: 'var(--text-faint)' }} />}
        </button>
      )}

      {/* Items — hidden when section is collapsed (but always show in icon-only mode) */}
      {(sectionOpen || collapsed || !section.label) && (
        <div className="space-y-0.5">
          {section.items.map(item => {
            const hasSubItems = !!(item.subItems?.length)
            const active = isItemActive(item.href, hasSubItems, pathname)
            const hasActiveChild = item.subItems?.some(s => pathname === s.href || pathname.startsWith(s.href + '/'))

            return (
              <div key={item.href}>
                <NavLink
                  href={item.href}
                  label={item.label}
                  icon={item.icon}
                  isActive={active || (hasSubItems && !!hasActiveChild)}
                  collapsed={collapsed}
                  onClick={onItemClick}
                />
                {/* Sub-items — always shown when section is open and sidebar is expanded */}
                {!collapsed && item.subItems?.map(sub => (
                  <NavLink
                    key={sub.href}
                    href={sub.href}
                    label={sub.label}
                    icon={sub.icon}
                    isActive={pathname === sub.href || pathname.startsWith(sub.href + '/')}
                    indent
                    collapsed={false}
                    onClick={onItemClick}
                  />
                ))}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Main shell ──────────────────────────────────────────────────────────────

export default function AppShell({ user, profile, children }: AppShellProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [showAddTx, setShowAddTx] = useState(false)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)

  // ⌘K / Ctrl+K opens global search
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSearchOpen(o => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Per-section collapse state (only collapsible sections, not 'main')
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    finance: true, business: true, payroll: true, tools: true, inbox: true,
  })

  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('inex-theme') as 'light' | 'dark') || 'light'
    }
    return 'light'
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('inex-theme', theme)
  }, [theme])

  useEffect(() => {
    const setAppHeight = () => {
      document.documentElement.style.setProperty('--app-height', `${window.innerHeight}px`)
    }
    setAppHeight()
    window.addEventListener('resize', setAppHeight)
    window.addEventListener('orientationchange', setAppHeight)
    return () => {
      window.removeEventListener('resize', setAppHeight)
      window.removeEventListener('orientationchange', setAppHeight)
    }
  }, [])

  useEffect(() => {
    const saved = localStorage.getItem('sidebar-collapsed')
    if (saved === 'true') setCollapsed(true)
    const savedSections = localStorage.getItem('sidebar-sections')
    if (savedSections) {
      try { setOpenSections(JSON.parse(savedSections)) } catch { /* ignore */ }
    }
  }, [])

  const toggleCollapsed = () => {
    setCollapsed(prev => {
      localStorage.setItem('sidebar-collapsed', String(!prev))
      return !prev
    })
  }

  const toggleSection = (id: string) => {
    setOpenSections(prev => {
      const next = { ...prev, [id]: !prev[id] }
      localStorage.setItem('sidebar-sections', JSON.stringify(next))
      return next
    })
  }

  const toggleTheme = () => setTheme(t => t === 'light' ? 'dark' : 'light')

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  const displayName = profile?.nickname || profile?.full_name || user.email?.split('@')[0] || 'You'
  const initials = displayName.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
  const avatarUrl = profile?.avatar_url

  const sidebarNav = (onItemClick?: () => void) => (
    <nav className="flex-1 px-2 py-2 overflow-y-auto space-y-0.5">
      {navSections.map(section => (
        <SidebarSection
          key={section.id}
          section={section}
          pathname={pathname}
          collapsed={collapsed}
          sectionOpen={openSections[section.id] ?? true}
          onToggle={() => toggleSection(section.id)}
          onItemClick={onItemClick}
        />
      ))}

      {/* Settings — always at bottom of nav */}
      <div className={collapsed ? '' : 'pt-1'}>
        <NavLink
          href="/settings"
          label="Settings"
          icon={Settings}
          isActive={pathname === '/settings' || pathname.startsWith('/settings/')}
          collapsed={collapsed}
          onClick={onItemClick}
        />
      </div>
    </nav>
  )

  return (
    <ToastProvider>
    <ConfirmProvider>
    <>
      {/* ══════════════════════════════════════
          DESKTOP LAYOUT
          ══════════════════════════════════════ */}
      <div
        className="hidden md:flex overflow-hidden"
        style={{ height: 'var(--app-height, 100dvh)', backgroundColor: 'var(--bg)' }}
      >
        {/* Desktop Sidebar */}
        <aside
          className={`flex flex-col h-full shrink-0 transition-all duration-200 border-r ${collapsed ? 'w-16' : 'w-60'}`}
          style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}
        >
          {/* Logo + collapse toggle */}
          <div
            className={`flex items-center h-14 shrink-0 border-b ${collapsed ? 'justify-center' : 'justify-between px-4'}`}
            style={{ borderColor: 'var(--border)' }}
          >
            {!collapsed && <img src="/vaultr-letter-logo.png" alt="Vaultr" className="h-6 w-auto object-contain" />}
            {collapsed && <img src="/vaultr-logo.png" alt="Vaultr" className="w-7 h-7 object-contain" />}
            {!collapsed && (
              <button onClick={toggleCollapsed} className="p-1.5 rounded-lg transition-colors" style={{ color: 'var(--text-muted)' }}>
                <PanelLeftClose className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Search trigger */}
          <button
            onClick={() => setSearchOpen(true)}
            className={`mx-2 mt-2 flex items-center gap-2 rounded-xl text-sm transition-colors ${collapsed ? 'justify-center p-2.5' : 'px-3 py-2'}`}
            style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}
            title="Search (⌘K)"
          >
            <Search className="w-4 h-4 shrink-0" />
            {!collapsed && <span className="flex-1 text-left">Search…</span>}
            {!collapsed && <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'var(--border)', color: 'var(--text-faint)' }}>⌘K</span>}
          </button>

          {collapsed && (
            <button
              onClick={toggleCollapsed}
              className="mx-auto mt-2 w-8 h-8 flex items-center justify-center rounded-lg"
              style={{ color: 'var(--text-muted)' }}
            >
              <PanelLeftOpen className="w-4 h-4" />
            </button>
          )}

          {sidebarNav()}

          {/* Dark mode + Add Transaction */}
          <div className={`px-2 pb-2 space-y-1.5 ${collapsed ? 'flex flex-col items-center' : ''}`}>
            <button
              onClick={toggleTheme}
              title="Toggle dark mode"
              className={`rounded-xl transition-all flex items-center justify-center gap-2 text-sm font-medium border ${collapsed ? 'w-10 h-10' : 'w-full py-2.5'}`}
              style={{ color: 'var(--text-muted)', borderColor: 'var(--border)', backgroundColor: 'var(--surface-2)' }}
            >
              {theme === 'dark' ? <Sun className="w-4 h-4 shrink-0" /> : <Moon className="w-4 h-4 shrink-0" />}
              {!collapsed && (theme === 'dark' ? 'Light Mode' : 'Dark Mode')}
            </button>
            <button
              onClick={() => setShowAddTx(true)}
              title={collapsed ? 'Add Transaction' : undefined}
              className={`bg-brand-500 hover:bg-brand-600 text-white font-semibold rounded-xl transition-all flex items-center justify-center gap-2 ${collapsed ? 'w-10 h-10' : 'w-full py-2.5 text-sm'}`}
            >
              <Plus className="w-4 h-4 shrink-0" />
              {!collapsed && 'Add Transaction'}
            </button>
          </div>

          {/* Profile */}
          <div
            className={`border-t pt-3 pb-4 px-2 ${collapsed ? 'flex justify-center' : ''}`}
            style={{ borderColor: 'var(--border)' }}
          >
            {collapsed ? (
              <Link href="/settings"><Avatar url={avatarUrl} initials={initials} size="sm" /></Link>
            ) : (
              <div className="flex items-center gap-2.5 px-1">
                <Avatar url={avatarUrl} initials={initials} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold truncate" style={{ color: 'var(--text)' }}>{displayName}</p>
                  <p className="text-[10px] truncate" style={{ color: 'var(--text-faint)' }}>{user.email}</p>
                </div>
                <button onClick={handleLogout} className="p-1" style={{ color: 'var(--text-muted)' }}>
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </aside>

        {/* Desktop main content */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          <main className="flex-1 overflow-y-auto" style={{ WebkitOverflowScrolling: 'touch' as never, overscrollBehaviorY: 'contain' }}>
            {children}
          </main>
        </div>
      </div>

      {/* ══════════════════════════════════════
          MOBILE LAYOUT
          ══════════════════════════════════════ */}
      <div
        className="md:hidden flex flex-col overflow-hidden"
        style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'var(--bg)',
        }}
      >
        {/* Mobile Header */}
        <header
          className="shrink-0 border-b"
          style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', paddingTop: 'env(safe-area-inset-top, 0px)' }}
        >
          <div className="relative flex items-center justify-between px-4 h-12">
            <button
              onClick={() => setMobileSidebarOpen(true)}
              className="w-10 h-10 flex items-center justify-center -ml-2 rounded-xl"
              style={{ color: 'var(--text-muted)' }}
            >
              <Menu className="w-5 h-5" />
            </button>
            <img src="/vaultr-letter-logo.png" alt="Vaultr" className="h-5 w-auto object-contain absolute left-1/2 -translate-x-1/2" />
            <div className="flex items-center -mr-2">
              <button
                onClick={() => setSearchOpen(true)}
                className="w-10 h-10 flex items-center justify-center"
                style={{ color: 'var(--text-muted)' }}
                aria-label="Search"
              >
                <Search className="w-5 h-5" />
              </button>
              <Link href="/settings" className="w-10 h-10 flex items-center justify-center">
                <Avatar url={avatarUrl} initials={initials} size="sm" />
              </Link>
            </div>
          </div>
        </header>

        <main
          className="flex-1 overflow-y-auto"
          style={{
            WebkitOverflowScrolling: 'touch' as never,
            overscrollBehaviorY: 'contain',
            backgroundColor: 'var(--bg)',
          }}
        >
          <div style={{ minHeight: '100%', backgroundColor: 'var(--bg)' }}>
            {children}
          </div>
        </main>

        {/* Floating + button */}
        <button
          onClick={() => setShowAddTx(true)}
          className="tap-scale"
          style={{
            position: 'fixed', right: 20,
            bottom: 'calc(env(safe-area-inset-bottom, 0px) + 20px)',
            width: 56, height: 56, borderRadius: 18,
            backgroundColor: 'var(--brand)',
            boxShadow: '0 6px 20px rgba(42,122,80,0.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 40,
          }}
        >
          <Plus className="w-6 h-6 text-white" strokeWidth={2.5} />
        </button>
      </div>

      {/* Mobile drawer */}
      {mobileSidebarOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="fixed inset-0 bg-black/50 backdrop-blur-[2px]" onClick={() => setMobileSidebarOpen(false)} />
          <aside
            className="relative flex flex-col w-[280px] h-full shadow-2xl slide-in-left"
            style={{ backgroundColor: 'var(--surface)', paddingTop: 'env(safe-area-inset-top, 0px)' }}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
              <img src="/vaultr-letter-logo.png" alt="Vaultr" className="h-5 w-auto object-contain" />
              <button onClick={() => setMobileSidebarOpen(false)} style={{ color: 'var(--text-muted)' }}>
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Mobile nav — section headers always expanded in mobile drawer */}
            <nav className="flex-1 px-3 py-2 overflow-y-auto">
              {navSections.map(section => (
                <div key={section.id} className="mb-1">
                  {section.label && (
                    <p className="px-2 pt-3 pb-1 text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-faint)' }}>
                      {section.label}
                    </p>
                  )}
                  <div className="space-y-0.5">
                    {section.items.map(item => {
                      const hasSubItems = !!(item.subItems?.length)
                      const active = isItemActive(item.href, hasSubItems, pathname)
                      const hasActiveChild = item.subItems?.some(s => pathname === s.href || pathname.startsWith(s.href + '/'))
                      return (
                        <div key={item.href}>
                          <NavLink
                            href={item.href} label={item.label} icon={item.icon}
                            isActive={active || (hasSubItems && !!hasActiveChild)}
                            collapsed={false}
                            onClick={() => setMobileSidebarOpen(false)}
                          />
                          {item.subItems?.map(sub => (
                            <NavLink
                              key={sub.href} href={sub.href} label={sub.label} icon={sub.icon}
                              isActive={pathname === sub.href || pathname.startsWith(sub.href + '/')}
                              indent collapsed={false}
                              onClick={() => setMobileSidebarOpen(false)}
                            />
                          ))}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
              <NavLink href="/settings" label="Settings" icon={Settings} isActive={pathname === '/settings'} collapsed={false} onClick={() => setMobileSidebarOpen(false)} />
            </nav>

            <div className="px-3 py-3 border-t space-y-2" style={{ borderColor: 'var(--border)' }}>
              <button
                onClick={toggleTheme}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium border transition-all"
                style={{ color: 'var(--text-muted)', borderColor: 'var(--border)', backgroundColor: 'var(--surface-2)' }}
              >
                {theme === 'dark' ? <Sun className="w-[18px] h-[18px]" /> : <Moon className="w-[18px] h-[18px]" />}
                {theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              </button>
              <div className="flex items-center gap-3 px-3 py-3 rounded-xl" style={{ backgroundColor: 'var(--surface-2)' }}>
                <Avatar url={avatarUrl} initials={initials} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>{displayName}</p>
                  <p className="text-xs truncate" style={{ color: 'var(--text-faint)' }}>{user.email}</p>
                </div>
                <button onClick={handleLogout} style={{ color: 'var(--text-muted)' }}>
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </div>
          </aside>
        </div>
      )}

      {showAddTx && (
        <TransactionForm onSaved={() => { setShowAddTx(false); router.refresh() }} onClose={() => setShowAddTx(false)} />
      )}
      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
    </ConfirmProvider>
    </ToastProvider>
  )
}

// ── Shared Avatar ──────────────────────────────────────────────────────────
export function Avatar({ url, initials, size = 'sm' }: { url?: string | null; initials: string; size?: 'sm' | 'md' | 'lg' }) {
  const sizes = { sm: 'w-8 h-8 text-xs', md: 'w-9 h-9 text-sm', lg: 'w-12 h-12 text-base' }
  if (url) {
    return <img src={url} alt={initials} className={`${sizes[size]} rounded-full object-cover ring-2 ring-white shrink-0`} />
  }
  return (
    <div className={`${sizes[size]} rounded-full bg-brand-100 flex items-center justify-center text-brand-600 font-bold shrink-0`}>
      {initials}
    </div>
  )
}
