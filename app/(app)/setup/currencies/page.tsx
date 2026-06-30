import { createClient } from '@/lib/supabase/server'
import CurrenciesClient from '@/components/currencies/CurrenciesClient'

export const dynamic = 'force-dynamic'

export default async function SetupCurrenciesTabPage() {
  const supabase = await createClient()

  const { data: rates } = await supabase
    .from('currency_rates')
    .select('*')
    .order('effective_from', { ascending: false })

  const seen = new Set<string>()
  const latestRates = (rates ?? []).filter(r => {
    if (seen.has(r.currency)) return false
    seen.add(r.currency)
    return true
  })

  return <CurrenciesClient initialRates={latestRates} />
}
