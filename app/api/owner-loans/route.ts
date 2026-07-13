import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Money you personally put INTO a company, or took OUT of it.
 *
 * This is the one number in the group that cannot be derived. A transfer from
 * your account to the company's looks exactly like a dozen other things, and
 * guessing wrong here doesn't produce an obviously broken screen — it produces a
 * net worth that is quietly off by the amount of the loan. So it is recorded
 * explicitly, once, and both sides read it from here.
 *
 * The arithmetic it enables (see lib/networth.ts): lending your own 100% company
 * ₹1L is a receivable to you and a payable inside it. Those cancel — right, you
 * only moved your own money. At 60% you keep 40% of it, because your partners
 * now owe you their share. Neither falls out unless the loan is booked on BOTH
 * sides, which is why it lives in one table rather than two half-truths.
 */

export const dynamic = 'force-dynamic'

const DIRECTIONS = new Set(['lent', 'repaid', 'drawn', 'returned'])

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = req.nextUrl.searchParams.get('company_id')

  let q = supabase.from('owner_loans')
    .select('id, company_id, direction, amount, date, note, transaction_id')
    .eq('user_id', user.id)
    .order('date', { ascending: false })

  if (companyId) q = q.eq('company_id', companyId)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ loans: data ?? [] })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const companyId = String(body.company_id ?? '')
  const direction = String(body.direction ?? '')
  const amount = Number(body.amount)

  if (!companyId) return NextResponse.json({ error: 'Which company?' }, { status: 400 })
  if (!DIRECTIONS.has(direction)) return NextResponse.json({ error: 'Unknown direction' }, { status: 400 })
  // A zero or negative loan is not a loan. The DIRECTION carries the sign; letting
  // a negative amount through would mean the same movement could be entered two
  // ways and net to nonsense.
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: 'Enter an amount greater than zero.' }, { status: 400 })
  }

  const { data, error } = await supabase.from('owner_loans').insert({
    user_id: user.id,
    company_id: companyId,
    direction,
    amount: Math.round(amount * 100) / 100,
    date: (body.date as string) || new Date().toISOString().split('T')[0],
    note: (body.note as string)?.trim() || null,
    transaction_id: (body.transaction_id as string) || null,
  }).select('*').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ loan: data })
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Which entry?' }, { status: 400 })

  const { error } = await supabase.from('owner_loans').delete()
    .eq('id', id).eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
