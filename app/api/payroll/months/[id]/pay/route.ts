import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type RouteContext = { params: Promise<{ id: string }> }

// POST — create expense transactions for all entries, mark month as paid
export async function POST(req: NextRequest, { params }: RouteContext) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { account_id: string; payment_date?: string; entry_ids?: string[] }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { account_id, payment_date, entry_ids } = body
  if (!account_id) return NextResponse.json({ error: 'account_id is required' }, { status: 400 })

  // Verify month is finalized
  const { data: month } = await supabase
    .from('payroll_months').select('*').eq('id', id).eq('user_id', user.id).single()
  if (!month) return NextResponse.json({ error: 'Month not found' }, { status: 404 })
  if (!month.is_finalized) return NextResponse.json({ error: 'Payroll must be finalized before marking as paid' }, { status: 400 })
  // A fully-paid month should not be re-processed. But a partially-paid
  // month (is_paid = false, some entries still open) is fine — the caller
  // is just paying the next subset.

  // Verify account exists
  const { data: account } = await supabase
    .from('accounts').select('id, name').eq('id', account_id).eq('user_id', user.id).single()
  if (!account) return NextResponse.json({ error: 'Account not found' }, { status: 404 })

  // Fetch entries with employee details. When entry_ids is passed, we only
  // process that subset — the rest of the month's entries stay unpaid.
  let entriesQuery = supabase
    .from('payroll_entries')
    .select('*, employee:employees(*)')
    .eq('payroll_month_id', id)
    .eq('user_id', user.id)
  if (Array.isArray(entry_ids) && entry_ids.length > 0) {
    entriesQuery = entriesQuery.in('id', entry_ids)
  }
  const { data: entries } = await entriesQuery

  if (!entries?.length) return NextResponse.json({ error: 'No payroll entries selected to pay' }, { status: 400 })

  const txDate = payment_date ?? month.payment_date ?? new Date().toISOString().slice(0, 10)

  // Format month label for transaction name  e.g. "May 2025"
  const [yr, mo] = month.payroll_month.split('-')
  const monthLabel = new Date(Number(yr), Number(mo) - 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })

  // Auto-detect salary/payroll expense category (best-effort)
  const SALARY_PATTERN = /salary|salaries|payroll|staff[\s_]pay|wages|staff[\s_]salary/i
  const { data: allCategories } = await supabase
    .from('categories').select('id, name').eq('user_id', user.id).eq('type', 'expense')
  const salaryCategoryId = allCategories?.find(c => SALARY_PATTERN.test(c.name))?.id ?? null

  // Create one expense transaction per entry. We collect any per-row errors
  // and surface them at the end so the UI shows a clear message instead of a
  // false-success when an insert is rejected (amount <= 0, RLS, etc.).
  const updatedEntries: typeof entries = []
  const failures: { name: string; reason: string }[] = []
  for (const entry of entries) {
    const empName = (entry.employee as { name?: string } | null)?.name ?? 'Employee'
    const amount = Number(entry.final_payable)

    // Skip entries that already have a settlement transaction — this happens
    // on a partial re-run where the previous batch already paid these people.
    if (entry.transaction_id) continue

    if (!Number.isFinite(amount) || amount <= 0) {
      failures.push({ name: empName, reason: `Final payable is ${entry.final_payable ?? 'null'} — needs to be > 0` })
      continue
    }

    const { data: tx, error: txErr } = await supabase
      .from('transactions')
      .insert({
        user_id:     user.id,
        account_id:  account_id,
        type:        'expense',
        amount,
        date:        txDate,
        name:        `Salary – ${empName}`,
        notes:       `${monthLabel} payroll via Vaultr`,
        category_id: salaryCategoryId,
      })
      .select('id')
      .single()

    if (txErr || !tx) {
      failures.push({ name: empName, reason: txErr?.message ?? 'unknown error' })
      continue
    }

    // Store transaction_id on entry
    await supabase
      .from('payroll_entries')
      .update({ transaction_id: tx.id })
      .eq('id', entry.id)
      .eq('user_id', user.id)

    updatedEntries.push({ ...entry, transaction_id: tx.id })
  }

  // If every entry failed, treat the whole call as a failure — don't mark the
  // month paid (so the user can fix the data and retry).
  if (updatedEntries.length === 0 && failures.length > 0) {
    return NextResponse.json(
      { error: `Could not create any salary transactions. ${failures.map(f => `${f.name}: ${f.reason}`).join('; ')}` },
      { status: 500 },
    )
  }

  // Was this a full or a partial pay run? Check if any entries are still
  // waiting for a transaction — if so, the month stays "in progress" (not
  // marked paid) so the user can come back and pay the rest.
  const { data: remaining } = await supabase
    .from('payroll_entries')
    .select('id, transaction_id')
    .eq('payroll_month_id', id)
    .eq('user_id', user.id)
  const anyStillUnpaid = (remaining ?? []).some(r => !r.transaction_id)
  const fullyPaid = !anyStillUnpaid

  const now = new Date().toISOString()
  const updates: Record<string, unknown> = {
    payment_account_id: account_id,
    payment_date: txDate,
  }
  if (fullyPaid) {
    updates.is_paid = true
    updates.paid_at = now
  }

  const { data: updatedMonth } = await supabase
    .from('payroll_months')
    .update(updates)
    .eq('id', id).eq('user_id', user.id)
    .select().single()

  return NextResponse.json({
    month: updatedMonth,
    entries: updatedEntries,
    account,
    failures,                            // [] when everything worked
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

  // Unmark paid — also clear payment_date so it doesn't linger and confuse
  // the next slip regeneration.
  const { data: updatedMonth } = await supabase
    .from('payroll_months')
    .update({ is_paid: false, paid_at: null, payment_account_id: null, payment_date: null })
    .eq('id', id).eq('user_id', user.id)
    .select().single()

  return NextResponse.json({ month: updatedMonth })
}
