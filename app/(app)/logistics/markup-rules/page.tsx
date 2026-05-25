import Link from 'next/link'
import { TrendingUp } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default function MarkupRulesPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="text-lg font-bold mb-6" style={{ color: 'var(--text)' }}>Markup Rules</h1>
      <div className="card p-10 flex flex-col items-center gap-4 text-center">
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ backgroundColor: 'var(--brand-light)' }}>
          <TrendingUp className="w-7 h-7" style={{ color: 'var(--brand)' }} />
        </div>
        <div>
          <p className="font-semibold mb-1" style={{ color: 'var(--text)' }}>Coming soon</p>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Per-supplier markup rules will be configurable here once the allocation engine is active.
          </p>
        </div>
        <Link href="/logistics" className="text-sm font-medium" style={{ color: 'var(--brand)' }}>
          ← Back to Logistics
        </Link>
      </div>
    </div>
  )
}
