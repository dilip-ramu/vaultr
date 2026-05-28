import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type RouteContext = { params: Promise<{ id: string }> }

// POST — create expense transactions for all entries, mark month as paid
export async function POST(req: NextRequest, { params }: RouteContext) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { account_id: string; payment_date?: string }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { account_id, payment_date } = body
  if (!account_id) return NextResponse.json({ error: 'account_id is required' }, { status: 400 })

  // Verify month is finalized
  const { data: month } = await supabase
    .from('payroll_months').select('*').eq('id', id).eq('user_id', user.id).single()
  if (!month) return NextResponse.json({ error: 'Month not found' }, { status: 404 })
  if (!month.is_finalized) return NextResponse.json({ error: 'Payroll must be finalized before marking as paid' }, { status: 400 })
  if (month.is_paid) return NextResponse.json({ error: 'Already paid' }, { status: 400 })

  // Verify account exists
  const { data: account } = await supabase
    .from('accounts').select('id, name').eq('id', account_id).eq('user_id', user.id).single()
  if (!account) return NextResponse.json({ error: 'Account not found' }, { status: 404 })

  // Fetch entries with employee details
  const { data: entries } = await supabase
    .from('payroll_entries')
    .select('*, employee:employees(*)')
    .eq('payroll_month_id', id)
    .eq('user_id', user.id)

  if (!entries?.length) return NextResponse.json({ error: 'No payroll entries found' }, { status: 400 })

  const txDate = payment_date ?? month.payment_date ?? new Date().toISOString().slice(0, 10)

  // Format month label for transaction name  e.g. "May 2025"
  const [yr, mo] = month.payroll_month.split('-')
  const monthLabel = new Date(Number(yr), Number(mo) - 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })

  // Create one expense transaction per entry
  const updatedEntries: typeof entries = []
  for (const entry of entries) {
    const empName = (entry.employee as { name?: string } | null)?.name ?? 'Employee'

    const { data: tx, error: txErr } = await supabase
      .from('transactions')
      .insert({
        user_id:    user.id,
        account_id: account_id,
        type:       'expense',
        amount:     Number(entry.final_payable),
        date:       txDate,
        name:       `Salary – ${empName}`,
        notes:      `${monthLabel} payroll via Vaultr`,
      })
      .select('id')
      .single()

    if (txErr || !tx) continue

    // Store transaction_id on entry
    await supabase
      .from('payroll_entries')
      .update({ transaction_id: tx.id })
      .eq('id', entry.id)
      .eq('user_id', user.id)

    updatedEntries.push({ ...entry, transaction_id: tx.id })
  }

  // Mark month as paid
  const now = new Date().toISOString()
  const { data: updatedMonth } = await supabase
    .from('payroll_months')
    .update({ is_paid: true, paid_at: now, payment_account_id: account_id })
    .eq('id', id).eq('user_id', user.id)
    .select().single()

  return NextResponse.json({
    month: updatedMonth,
    entries: updatedEntries,
    account,
  })
}

// DELETE — reverse payment: delete transactions, unmark paid
export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: month } = await supabase
    .from('payroll_months').select('is_paid').eq('id', id).eq('user_id', user.id).single()
  if (!month) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!month.is_paid) return NextResponse.json({ error: 'Not paid' }, { status: 400 })

  // Get all transaction_ids from entries
  const { data: entries } = await supabase
    .from('payroll_entries')
    .select('transaction_id')
    .eq('payroll_month_id', id)
    .eq('user_id', user.id)
    .not('transaction_id', 'is', null)

  const txIds = (entries ?? []).map(e => e.transaction_id).filter(Boolean)

  // Delete transactions (cascade handles attachments)
  if (txIds.length > 0) {
    await supabase.from('transactions').delete().in('id', txIds).eq('user_id', user.id)
  }

  // Clear transaction_ids on entries
  await supabase
    .from('payroll_entries')
    .update({ transaction_id: null })
    .eq('payroll_month_id', id)
    .eq('user_id', user.id)

  // Unmark paid
  const { data: updatedMonth } = await supabase
    .from('payroll_months')
    .update({ is_paid: false, paid_at: null, payment_account_id: null })
    .eq('id', id).eq('user_id', user.id)
    .select().single()

  return NextResponse.json({ month: updatedMonth })
}
