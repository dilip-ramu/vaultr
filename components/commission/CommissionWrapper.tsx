'use client'

import dynamic from 'next/dynamic'

const CommissionClient = dynamic(() => import('./CommissionClient'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center py-24 text-sm" style={{ color: 'var(--text-muted)' }}>
      Loading…
    </div>
  ),
})

export default function CommissionWrapper() {
  return <CommissionClient />
}
