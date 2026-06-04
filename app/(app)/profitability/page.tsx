import { createClient } from '@/lib/supabase/server'
import ProfitabilityClient from '@/components/profitability/ProfitabilityClient'
import type { ProfitLine } from '@/lib/profitability'

export const dynamic = 'force-dynamic'

export default async function ProfitabilityPage() {
  const supabase = await createClient()

  // Single RPC — all aggregation happens in Postgres (migration_v31)
  const { data, error } = await supabase.rpc('get_profitability_lines')

  // Function missing → migration not run yet
  const setupNeeded = !!error

  const lines: ProfitLine[] = (data ?? []).map((r: {
    kind: string; side: string; source: string; day: string; amount: number | string
  }) => ({
    kind: r.kind as ProfitLine['kind'],
    side: r.side as ProfitLine['side'],
    source: r.source as ProfitLine['source'],
    day: r.day,
    amount: Number(r.amount),
  }))

  return <ProfitabilityClient lines={lines} setupNeeded={setupNeeded} />
}
