import { createClient } from '@/lib/supabase/server'
import ProfitabilityClient from '@/components/profitability/ProfitabilityClient'
import { fetchProfitLines } from '@/lib/profitability-server'

export const dynamic = 'force-dynamic'

export default async function ProfitabilityPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const lines = await fetchProfitLines(supabase, user!.id)

  return <ProfitabilityClient lines={lines} />
}
