import { createClient } from '@/lib/supabase/server'
import { getLabOverview } from '@/lib/investments/lab/overview'
import LabClient from '@/components/investments/lab/LabClient'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Investment Lab — Vaultr' }

// The overview is built server-side from persisted marks and ledger rows only —
// opening this page costs nothing and triggers no research.
export default async function InvestmentLabPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const overview = await getLabOverview(supabase, user!.id)
  return <LabClient initial={overview} />
}
