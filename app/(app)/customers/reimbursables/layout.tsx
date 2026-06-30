import Link from 'next/link'
import { Plus } from 'lucide-react'
import ReimbursablesTabs from '@/components/customers/reimbursables/ReimbursablesTabs'

export default function ReimbursablesLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-3 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>Reimbursables</h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
              Expenses your customers (currently: Contrast) reimburse — and the invoices you've issued for them.
            </p>
          </div>
          {/* Reachable from either tab. The existing create-invoice flow lives
              at /contrast/invoice and uses the Contrast customer by default. */}
          <Link
            href="/contrast/invoice"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold text-white shrink-0"
            style={{ background: 'var(--brand)' }}
          >
            <Plus className="w-4 h-4" /> New invoice
          </Link>
        </div>
        <ReimbursablesTabs />
      </div>
      <div>{children}</div>
    </div>
  )
}
