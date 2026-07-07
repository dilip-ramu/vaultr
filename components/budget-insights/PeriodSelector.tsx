'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import PeriodPills, { type PeriodValue } from '@/components/shared/PeriodPills'

export default function PeriodSelector() {
  const router = useRouter()
  const params = useSearchParams()
  const period = (params.get('period') as PeriodValue | null) ?? 'month'

  const go = (p: PeriodValue, from?: string, to?: string) => {
    const sp = new URLSearchParams(params.toString())
    if (p === 'month') sp.delete('period'); else sp.set('period', p)
    if (p === 'custom' && from && to) { sp.set('from', from); sp.set('to', to) }
    else { sp.delete('from'); sp.delete('to') }
    router.replace(`?${sp.toString()}`)
  }

  return (
    <PeriodPills
      value={period}
      onChange={p => go(p)}
      customFrom={params.get('from') ?? ''}
      customTo={params.get('to') ?? ''}
      onApplyCustom={(from, to) => go('custom', from, to)}
    />
  )
}
