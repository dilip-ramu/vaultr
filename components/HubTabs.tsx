'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

/**
 * Route-based sub-tabs for the restructured hubs (mirrors the sidebar IA).
 * Rendered once in AppShell above the page content: it figures out which hub
 * the current route belongs to and shows that hub's tabs. On routes that
 * aren't part of a hub (Dashboard, Settings, detail pages) it renders nothing.
 */
type Tab = { href: string; label: string }
// Single canonical sub-nav per hub. This is the ONE tab strip a hub gets —
// the old per-layout tab bars (OrganizationTabs, Suppliers/CustomersHomeTabs,
// SupplierInvoicesTabs, TransactionsPageTabs) were removed so nothing doubles
// up. Genuinely deeper second-level tabs (e.g. the Couriers/Reimbursables/
// Invoices bar under Customers → Invoices) stay in their own layouts.
const HUBS: { name: string; tabs: Tab[] }[] = [
  { name: 'Transactions', tabs: [
    { href: '/transactions', label: 'All transactions' },
    { href: '/transactions/fetch', label: 'Fetch' },
  ] },
  { name: 'Accounts', tabs: [
    { href: '/accounts', label: 'Balances' },
    { href: '/cards', label: 'Cards' },
  ] },
  { name: 'Insights', tabs: [
    { href: '/budget-insights', label: 'Budgets' },
    { href: '/profitability', label: 'Profitability' },
    { href: '/forecast', label: 'Forecast' },
    { href: '/books', label: 'Books' },
  ] },
  { name: 'Customers', tabs: [
    { href: '/customers', label: 'Overview' },
    { href: '/customers/directory', label: 'Directory' },
    { href: '/customers/invoices', label: 'Invoices' },
    { href: '/customers/documents/proforma_gst', label: 'Proforma' },
    { href: '/customers/documents/delivery_challan', label: 'Challans' },
    { href: '/customers/documents/credit_note', label: 'Credit Notes' },
    { href: '/customers/commission', label: 'Incoming' },
    { href: '/recoverables/tds', label: 'TDS' },
  ] },
  { name: 'Suppliers', tabs: [
    { href: '/suppliers', label: 'Overview' },
    { href: '/suppliers/directory', label: 'Directory' },
    { href: '/suppliers/invoices', label: 'Invoices' },
    { href: '/suppliers/documents/purchase_order', label: 'Purchase Orders' },
    { href: '/suppliers/documents/debit_note', label: 'Debit Notes' },
    { href: '/suppliers/documents/delivery_challan', label: 'Challans' },
    { href: '/suppliers/invoices/fetch', label: 'Fetch' },
  ] },
  { name: 'Payroll', tabs: [
    { href: '/payroll/processing', label: 'Processing' },
    { href: '/payroll/slips', label: 'Slips' },
  ] },
  { name: 'Organization', tabs: [
    { href: '/organization', label: 'Companies' },
    { href: '/organization/employees', label: 'Employees' },
    { href: '/organization/contracts', label: 'Contracts' },
  ] },
  { name: 'System', tabs: [
    { href: '/setup/settings',      label: 'Settings' },
    { href: '/setup/users',         label: 'Users' },
    { href: '/setup/email',         label: 'Email' },
    { href: '/setup/categories',    label: 'Categories' },
    { href: '/setup/account-types', label: 'Account types' },
    { href: '/setup/banks',         label: 'Banks' },
    { href: '/setup/currencies',    label: 'Currencies' },
    { href: '/setup/export',        label: 'Downloads' },
  ] },
]

function matchLen(pathname: string, href: string): number {
  if (pathname === href) return href.length + 1 // exact wins over prefix
  if (pathname.startsWith(href + '/')) return href.length
  return -1
}

export default function HubTabs() {
  const pathname = usePathname() || ''

  // Find the hub + active tab: the tab whose href is the longest match.
  let hub: { name: string; tabs: Tab[] } | null = null
  let activeHref = ''
  let bestLen = -1
  for (const h of HUBS) {
    for (const t of h.tabs) {
      const len = matchLen(pathname, t.href)
      if (len > bestLen) { bestLen = len; hub = h; activeHref = t.href }
    }
  }
  if (!hub || bestLen < 0) return null

  return (
    <div className="px-4 md:px-8 pt-4" style={{ background: 'var(--bg)' }}>
      <div className="flex gap-1 overflow-x-auto no-scrollbar" style={{ borderBottom: '1px solid var(--border)' }}>
        {hub.tabs.map(t => {
          const active = t.href === activeHref
          return (
            <Link
              key={t.href}
              href={t.href}
              className="relative whitespace-nowrap px-3.5 py-2.5 text-[13px] font-bold transition-colors"
              style={{ color: active ? 'var(--brand)' : 'var(--text-muted)' }}
            >
              {t.label}
              {active && <span className="absolute left-2 right-2 -bottom-px h-0.5 rounded-full" style={{ background: 'var(--brand)' }} />}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
