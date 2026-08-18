import { createClient } from '@/lib/supabase/server'
import HoldingsClient from '@/components/investments/HoldingsClient'
import type { HoldingRow, RecRow } from '@/components/investments/shared'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Holdings — Vaultr' }

export default async function HoldingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: holdings }, { data: recs }] = await Promise.all([
    supabase.from('inv_holdings').select('*').eq('user_id', user!.id).order('created_at', { ascending: true }),
    // Ascending so the client's Map keeps the NEWEST recommendation per symbol.
    supabase.from('inv_recommendations').select('*').eq('user_id', user!.id).order('created_at', { ascending: true }),
  ])

  return <HoldingsClient holdings={(holdings ?? []) as HoldingRow[]} recs={(recs ?? []) as RecRow[]} />
}
