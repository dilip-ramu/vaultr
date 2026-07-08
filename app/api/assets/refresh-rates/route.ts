import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { fetchAndStoreMetalRates } from '@/lib/assets/fetchRates'

// Manual "Refresh" from the Market rates tab. Requires a signed-in user.
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const result = await fetchAndStoreMetalRates()
  return NextResponse.json(result, { status: result.ok ? 200 : 502 })
}
