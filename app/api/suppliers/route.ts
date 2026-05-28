import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { Supplier } from '@/lib/suppliers/types'

// GET — list all suppliers with aggregated finance stats
export async function GET(_req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [{ data: suppliers }, { data: invoices }] = await Promise.all([
    supabase
      .from('suppliers')
      .select('*')
      .eq('user_id', user.id)
      .order('name'),
    supabase
      .from('supplier_invoices')
      .select('supplier_id, amount, is_paid, is_recoverable, status, payment_date')
      .eq('user_id', user.id),
  ])

  if (!suppliers) return NextResponse.json({ suppliers: [] })

  // Aggregate stats per supplier
  const invMap = new Map<string, typeof invoices>()
  for (const inv of (invoices ?? [])) {
    if (!invMap.has(inv.supplier_id)) invMap.set(inv.supplier_id, [])
    invMap.get(inv.supplier_id)!.push(inv)
  }

  const enriched = suppliers.map(s => {
    const sinvs = invMap.get(s.id) ?? []
    const active = sinvs.filter(i => i.status !== 'cancelled')
    const outstanding = active.filter(i => !i.is_paid).reduce((sum, i) => sum + Number(i.amount), 0)
    const totalPaid = active.filter(i => i.is_paid).reduce((sum, i) => sum + Number(i.amount), 0)
    const totalRecoverable = active.filter(i => i.is_recoverable).reduce((sum, i) => sum + Number(i.amount), 0)
    const overdueCount = active.filter(i => i.status === 'overdue').length
    const pendingCount = active.filter(i => !i.is_paid && i.status !== 'cancelled').length
    const paidDates = active.filter(i => i.is_paid && i.payment_date).map(i => i.payment_date!).sort()
    return {
      ...s,
      total_invoices: sinvs.length,
      pending_invoices: pendingCount,
      overdue_invoices: overdueCount,
      outstanding_amount: outstanding,
      total_paid: totalPaid,
      total_recoverable: totalRecoverable,
      last_payment_date: paidDates.at(-1) ?? null,
    }
  })

  return NextResponse.json({ suppliers: enriched })
}

// POST — create supplier
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: Partial<Supplier>
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('suppliers')
    .insert({ ...body, user_id: user.id })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ supplier: data }, { status: 201 })
}
