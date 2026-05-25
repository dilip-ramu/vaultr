'use client'

import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard, Wallet, ArrowLeftRight, Tag, Receipt,
  Users, Settings, Plus, LogOut, ChevronRight,
  X, Menu, PanelLeftClose, PanelLeftOpen, Layers, DollarSign
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'
import type { Profile } from '@/lib/types'
import BillNotificationBanner from './bills/BillNotificationBanner'

const TransactionForm = dynamic(() => import('./transactions/TransactionForm'), { ssr: false })

interface AppShellProps {
  user: User
  profile: Profile | null
  children: React.ReactNode
}

const navItems = [
  { href: '/dashboard',     label: 'Dashboard',     icon: LayoutDashboard },
  { href: '/accounts',      label: 'Accounts',      icon: Wallet },
  { href: '/transactions',  label: 'Transactions',  icon: ArrowLeftRight },
  { href: '/bills',         label: 'Bills',         icon: Receipt },
  { href: '/customers',     label: 'Customers',     icon: Users },
  { href: '/categories',    label: 'Categories',    icon: Tag },
  { href: '/account-types', label: 'Account Types', icon: Layers },
  { href: '/currencies',    label: 'Currencies',    icon: DollarSign },
]

const bottomNavItems = [
  { href: '/dashboard',    label: 'Home',         icon: LayoutDashboard },
  { href: '/accounts',     label: 'Accounts',     icon: Wallet },
  { href: '/transactions', label: 'Transactions', icon: ArrowLeftRight },
  { href: '/bills',        label: 'Bills',        icon: Receipt },
]

export default function AppShell({ user, profile, children }: AppShellProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [showAddTx, setShowAddTx] = useState(false)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem('sidebar-collapsed')
    if (saved === 'true') setCollapsed(true)
  }, [])

  const toggleCollapsed = () => {
    setCollapsed(prev => {
      localStorage.setItem('sidebar-collapsed', String(!prev))
      return !prev
    })
  }

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  const displayName = profile?.nickname || profile?.full_name || user.email?.split('@')[0] || 'You'
  const initials = displayName.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
  const avatarUrl = profile?.avatar_url

  return (
    <div className="flex bg-[#F7F8FA] overflow-hidden" style={{ height: '100dvh' }}>

      {/* ── Desktop Sidebar ── */}
      <aside className={`hidden md:flex flex-col bg-white border-r border-gray-100 h-full shrink-0 transition-all duration-200 ${collapsed ? 'w-16' : 'w-60'}`}>

        {/* Logo + collapse toggle */}
        <div className={`flex items-center border-b border-gray-100 h-14 shrink-0 ${collapsed ? 'justify-center px-0' : 'justify-between px-4'}`}>
          {!collapsed && (
            <img src="/vaultr-letter-logo.png" alt="Vaultr" className="h-8 w-auto object-contain" />
          )}
          {collapsed && (
            <img src="/vaultr-logo.png" alt="Vaultr" className="w-8 h-8 object-contain" />
          )}
          <button
            onClick={toggleCollapsed}
            className={`text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg p-1.5 transition-all ${collapsed ? 'hidden' : ''}`}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <PanelLeftClose className="w-4 h-4" />
          </button>
        </div>

        {/* Expand button when collapsed */}
        {collapsed && (
          <button
            onClick={toggleCollapsed}
            className="mx-auto mt-2 w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg transition-all"
          >
            <PanelLeftOpen className="w-4 h-4" />
          </button>
        )}

        {/* Nav */}
        <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(href + '/')
            return (
              <Link
                key={href}
                href={href}
                title={collapsed ? label : undefined}
                className={`flex items-center gap-3 px-2.5 py-2.5 rounded-xl text-sm font-medium transition-all ${collapsed ? 'justify-center' : ''} ${
                  active
                    ? 'bg-brand-50 text-brand-600'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <Icon className="w-4.5 h-4.5 shrink-0" />
                {!collapsed && <span className="flex-1">{label}</span>}
                {!collapsed && active && <ChevronRight className="w-3.5 h-3.5" />}
              </Link>
            )
          })}

          <Link
            href="/settings"
            title={collapsed ? 'Settings' : undefined}
            className={`flex items-center gap-3 px-2.5 py-2.5 rounded-xl text-sm font-medium transition-all ${collapsed ? 'justify-center' : ''} ${
              pathname === '/settings' ? 'bg-brand-50 text-brand-600' : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            <Settings className="w-4.5 h-4.5 shrink-0" />
            {!collapsed && <span className="flex-1">Settings</span>}
          </Link>
        </nav>

        {/* Add Transaction button */}
        <div className={`px-2 pb-3 ${collapsed ? 'flex justify-center' : ''}`}>
          <button
            onClick={() => setShowAddTx(true)}
            title={collapsed ? 'Add Transaction' : undefined}
            className={`bg-brand-500 hover:bg-brand-600 text-white font-semibold rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 ${
              collapsed ? 'w-10 h-10' : 'w-full py-2.5 text-sm'
            }`}
          >
            <Plus className="w-4 h-4 shrink-0" />
            {!collapsed && 'Add Transaction'}
          </button>
        </div>

        {/* Profile */}
        <div className={`border-t border-gray-100 pt-3 pb-4 px-2 ${collapsed ? 'flex justify-center' : ''}`}>
          {collapsed ? (
            <Link href="/settings" title="Profile & Settings">
              <Avatar url={avatarUrl} initials={initials} size="sm" />
            </Link>
          ) : (
            <div className="flex items-center gap-2.5 px-1">
              <Avatar url={avatarUrl} initials={initials} size="sm" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-gray-900 truncate">{displayName}</p>
                <p className="text-[10px] text-gray-400 truncate">{user.email}</p>
              </div>
              <button onClick={handleLogout} title="Sign out" className="text-gray-400 hover:text-gray-600 p-1">
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* ── Mobile Sidebar Drawer ── */}
      {mobileSidebarOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-[2px]"
            onClick={() => setMobileSidebarOpen(false)}
          />
          <aside
            className="relative flex flex-col w-[280px] bg-white h-full shadow-xl slide-in-left"
            style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
          >
            {/* Drawer header */}
            <div className="px-5 py-4 flex items-center justify-between border-b border-gray-100">
              <img src="/vaultr-letter-logo.png" alt="Vaultr" className="h-6 w-auto object-contain" />
              <button
                onClick={() => setMobileSidebarOpen(false)}
                className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Nav */}
            <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
              {[...navItems, { href: '/settings', label: 'Settings', icon: Settings }].map(({ href, label, icon: Icon }) => {
                const active = pathname === href || pathname.startsWith(href + '/')
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setMobileSidebarOpen(false)}
                    className={`flex items-center gap-3 py-2.5 px-3 rounded-xl text-sm font-medium transition-all ${
                      active ? 'bg-brand-50 text-brand-600' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    }`}
                  >
                    <Icon style={{ width: 18, height: 18 }} className="shrink-0" />
                    {label}
                  </Link>
                )
              })}
            </nav>

            {/* Profile card */}
            <div className="px-4 pb-6 pt-3 border-t border-gray-100">
              <div className="flex items-center gap-3">
                <Avatar url={avatarUrl} initials={initials} size="md" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{displayName}</p>
                  <p className="text-xs text-gray-400 truncate">{user.email}</p>
                </div>
                <button
                  onClick={handleLogout}
                  className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* ── Main Content ── */}
      <div className="flex-1 flex flex-col h-full overflow-hidden min-w-0">

        {/* Mobile Top Header */}
        <header
          className="md:hidden bg-white border-b border-gray-100 shrink-0 flex items-center px-2"
          style={{
            paddingTop: 'calc(env(safe-area-inset-top, 0px) + 8px)',
            paddingBottom: '8px',
          }}
        >
          <button
            onClick={() => setMobileSidebarOpen(true)}
            className="w-10 h-10 flex items-center justify-center text-gray-600 rounded-xl hover:bg-gray-50 transition-colors"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex-1 flex justify-center">
            <img src="/vaultr-letter-logo.png" alt="Vaultr" className="h-5 w-auto object-contain" />
          </div>
          <Link
            href="/settings"
            className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-gray-50 transition-colors"
          >
            <Avatar url={avatarUrl} initials={initials} size="sm" />
          </Link>
        </header>

        {/* Bill notification banner */}
        <BillNotificationBanner />

        {/* Page content */}
        <main className="flex-1 overflow-y-auto pb-[calc(76px+env(safe-area-inset-bottom,0px))] md:pb-0"
          style={{ WebkitOverflowScrolling: 'touch' }}>
          {children}
        </main>

        {/* ── Mobile Bottom Tab Bar ── */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white z-40 shadow-[0_-1px_12px_rgba(0,0,0,0.06)] overflow-visible">
          <div className="flex items-center h-[60px]">

            {/* Left two tabs: Home, Accounts */}
            {bottomNavItems.slice(0, 2).map(({ href, label, icon: Icon }) => {
              const active = pathname === href
              return (
                <Link
                  key={href}
                  href={href}
                  className={`flex-1 flex flex-col items-center justify-center gap-0.5 h-full transition-colors ${active ? 'text-brand-500' : 'text-gray-400'}`}
                >
                  <Icon className="w-5 h-5" strokeWidth={active ? 2.5 : 1.5} />
                  <span className="text-[9px] font-medium mt-0.5">{label}</span>
                </Link>
              )
            })}

            {/* Center FAB slot */}
            <div className="flex-1 relative flex flex-col items-center justify-center">
              {/* White notch behind FAB */}
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-[68px] h-[68px] rounded-full bg-white pointer-events-none" />
              {/* FAB */}
              <button
                onClick={() => setShowAddTx(true)}
                className="relative z-10 -mt-5 w-14 h-14 bg-brand-500 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-200/60 active:scale-95 transition-transform"
              >
                <Plus className="w-5 h-5 text-white" strokeWidth={2} />
              </button>
            </div>

            {/* Right two tabs: Transactions, Bills */}
            {bottomNavItems.slice(2).map(({ href, label, icon: Icon }) => {
              const active = pathname === href
              return (
                <Link
                  key={href}
                  href={href}
                  className={`flex-1 flex flex-col items-center justify-center gap-0.5 h-full transition-colors ${active ? 'text-brand-500' : 'text-gray-400'}`}
                >
                  <Icon className="w-5 h-5" strokeWidth={active ? 2.5 : 1.5} />
                  <span className="text-[9px] font-medium mt-0.5">{label}</span>
                </Link>
              )
            })}

          </div>
          {/* Safe area filler — extends white background under home indicator */}
          <div className="bg-white" style={{ height: 'env(safe-area-inset-bottom, 0px)' }} />
        </nav>
      </div>

      {/* Add Transaction Modal */}
      {showAddTx && (
        <TransactionForm onSaved={() => { setShowAddTx(false); router.refresh() }} onClose={() => setShowAddTx(false)} />
      )}
    </div>
  )
}

// ── Shared Avatar component ────────────────────────────────────────
export function Avatar({ url, initials, size = 'sm' }: { url?: string | null; initials: string; size?: 'sm' | 'md' | 'lg' }) {
  const sizes = { sm: 'w-8 h-8 text-xs', md: 'w-9 h-9 text-sm', lg: 'w-12 h-12 text-base' }
  if (url) {
    return (
      <img
        src={url}
        alt={initials}
        className={`${sizes[size]} rounded-full object-cover ring-2 ring-white shrink-0`}
      />
    )
  }
  return (
    <div className={`${sizes[size]} rounded-full bg-brand-100 flex items-center justify-center text-brand-600 font-bold shrink-0`}>
      {initials}
    </div>
  )
}
