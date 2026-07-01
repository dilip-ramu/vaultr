import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { calcSalaryInr, calcFinalPayable } from '@/lib/payroll/types'

type RouteContext = { params: Promise<{ id: string }> }

// POST — generate payroll entries for all active employees
export async function POST(req: NextRequest, { params }: RouteContext) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { expended_rate: number }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { expended_rate } = body
  if (!expended_rate || expended_rate <= 0) {
    return NextResponse.json({ error: 'Expended Euro Rate is required' }, { status: 400 })
  }

  // Verify month exists (finalized months can still be regenerated)
  const { data: month } = await supabase
    .from('payroll_months').select('*').eq('id', id).eq('user_id', user.id).single()
  if (!month) return NextResponse.json({ error: 'Month not found' }, { status: 404 })

  // Fetch active employees
  const { data: employees } = await supabase
    .from('employees').select('*').eq('user_id', user.id).eq('is_active', true)

  if (!employees?.length) {
    return NextResponse.json({ error: 'No active employees found' }, { status: 400 })
  }

  // Delete existing draft entries then regenerate
  await supabase.from('payroll_entries').delete().eq('payroll_month_id', id).eq('user_id', user.id)

  const rows = employees.map(emp => {
    // INR-native employees pay through 1:1; others convert at the batch rate.
    const salary_inr = calcSalaryInr(emp.salary_amount, expended_rate, emp.salary_currency ?? 'INR')
    const final_payable = calcFinalPayable(salary_inr, 0, 0, 0, 0, 0)
    return {
      user_id:          user.id,
      payroll_month_id: id,
      employee_id:      emp.id,
      salary_amount:      emp.salary_amount,
      expended_rate,
      salary_inr,
      allowances:   0,
      overtime:     0,
      incentives:   0,
      deductions:   0,
      advance:      0,
      final_payable,
    }
  })

  const { data: entries, error } = await supabase
    .from('payroll_entries').insert(rows).select('*, employee:employees(*)')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Update month with expended_rate
  await supabase.from('payroll_months')
    .update({ expended_rate })
    .eq('id', id).eq('user_id', user.id)

  return NextResponse.json({ entries: entries ?? [] })
}

// PATCH — update a single entry (allowances, overtime, etc.)
export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const { id: monthId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { entry_id: string } & Record<string, unknown>
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { entry_id, ...fields } = body

  // Recalculate final_payable
  const { data: existing } = await supabase
    .from('payroll_entries').select('*').eq('id', entry_id).eq('user_id', user.id).single()
  if (!existing) return NextResponse.json({ error: 'Entry not found' }, { status: 404 })

  const merged = { ...existing, ...fields }
  const final_payable = calcFinalPayable(
    Number(merged.salary_inr),
    Number(merged.allowances),
    Number(merged.overtime),
    Number(merged.incentives),
    Number(merged.deductions),
    Number(merged.advance),
  )

  const { data: updated, error } = await supabase
    .from('payroll_entries')
    .update({ ...fields, final_payable })
    .eq('id', entry_id)
    .eq('user_id', user.id)
    .select('*, employee:employees(*)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // If month is finalized, refresh the salary slip for this entry
  const { data: monthData } = await supabase
    .from('payroll_months').select('is_finalized').eq('id', monthId).eq('user_id', user.id).single()

  if (monthData?.is_finalized) {
    await supabase.from('salary_slips').delete().eq('payroll_entry_id', entry_id).eq('user_id', user.id)
    await supabase.from('salary_slips').insert({
      user_id: user.id,
      payroll_entry_id: entry_id,
      generated_at: new Date().toISOString(),
    })
  }

  return NextResponse.json({ entry: updated })
}
