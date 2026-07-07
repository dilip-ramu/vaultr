export default function TransactionsLayout({ children }: { children: React.ReactNode }) {
  // Sub-nav (Transactions / Fetch) comes from the top hub toggle (HubTabs).
  return (
    <div className="w-full px-4 py-6 space-y-4">
      <div>
        <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>Transactions</h1>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Your transactions plus the inbox that fetches new ones from bank-alert emails</p>
      </div>
      <div>{children}</div>
    </div>
  )
}
