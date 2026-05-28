import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { calcEffectiveRate } from '@/lib/payroll/types'

type RouteContext = { params: Promise<{ id: string }> }

// GET — fetch month + its entries with employee details
export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [{ data: month }, { data: entries }] = await Promise.all([
    supabase.from('payroll_months').select('*').eq('id', id).eq('user_id', user.id).single(),
    supabase.from('payroll_entries')
      .select('*, employee:employees(*)')
      .eq('payroll_month_id', id)
      .eq('user_id', user.id)
      .order('created_at', { ascending: true }),
  ])

  if (!month) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ month, entries: entries ?? [] })
}

// PATCH — update summary fields (rates, dates, etc.)
export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Auto-recalculate effective_rate if financial fields change
  const receivedInr  = Number(body.received_inr  ?? 0)
  const bankCharges  = Number(body.bank_charges   ?? 0)
  const billedEuros  = Number(body.billed_euros   ?? 0)

  if (receivedInr || bankCharges || billedEuros) {
    body.effective_rate = calcEffectiveRate(receivedInr, bankCharges, billedEuros)
  }

  const { data, error } = await supabase
    .from('payroll_months')
    .update(body)
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ month: data })
}

export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: month } = await supabase
    .from('payroll_months').select('id').eq('id', id).eq('user_id', user.id).single()

  if (!month) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  // Cascade in DB handles entries + salary_slips automatically

  const { error } = await supabase.from('payroll_months').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
