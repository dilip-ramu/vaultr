import { NextRequest, NextResponse } from 'next/server'
import { fetchAndStoreMetalRates } from '@/lib/assets/fetchRates'

// Daily gold/silver price fetch (10:01 AM cron). Fail-closed on the cron secret.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const result = await fetchAndStoreMetalRates()
  return NextResponse.json(result)
}
