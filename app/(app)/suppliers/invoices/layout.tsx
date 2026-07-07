export default function SupplierInvoicesLayout({ children }: { children: React.ReactNode }) {
  // Sub-nav (Invoices / Fetch) is provided by the single top hub toggle
  // (HubTabs → Suppliers), so there is no in-page tab bar here.
  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>Supplier Invoices</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
          Manage supplier bills, fetch new ones from your email, and configure the inbox connection
        </p>
      </div>
      <div>{children}</div>
    </div>
  )
}
