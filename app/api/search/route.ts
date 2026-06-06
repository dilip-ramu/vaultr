import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export interface SearchHit {
  type: 'transaction' | 'customer_invoice' | 'supplier_invoice' | 'supplier' | 'customer' | 'employee'
  label: string
  sub?: string
  href: string
}

// GET /api/search?q=... — searches across the main records the user has.
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ hits: [] })

  const q = (req.nextUrl.searchParams.get('q') ?? '').trim()
  if (q.length < 2) return NextResponse.json({ hits: [] })

  const uid = user.id
  const like = `%${q}%`

  const [tx, ci, si, sup, cust, emp] = await Promise.all([
    supabase.from('transactions')
      .select('id, name, amount, date')
      .eq('user_id', uid).ilike('name', like)
      .order('date', { ascending: false }).limit(6),
    supabase.from('recoverable_invoices')
      .select('id, invoice_number, customer_name, total')
      .eq('user_id', uid).or(`invoice_number.ilike.${like},customer_name.ilike.${like}`)
      .limit(6),
    supabase.from('supplier_invoices')
      .select('id, invoice_number, payee_name, amount')
      .eq('user_id', uid).or(`invoice_number.ilike.${like},payee_name.ilike.${like}`)
      .limit(6),
    supabase.from('suppliers')
      .select('id, name, supplier_code')
      .eq('user_id', uid).ilike('name', like).limit(5),
    supabase.from('customers')
      .select('id, name')
      .eq('user_id', uid).ilike('name', like).limit(5),
    supabase.from('employees')
      .select('id, name, employee_id')
      .eq('user_id', uid).ilike('name', like).limit(5),
  ])

  const inr = (n: number) => `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
  const hits: SearchHit[] = []

  for (const t of tx.data ?? [])
    hits.push({ type: 'transaction', label: t.name ?? 'Transaction', sub: `${inr(t.amount)} · ${t.date}`, href: '/transactions' })
  for (const i of ci.data ?? [])
    hits.push({ type: 'customer_invoice', label: `${i.invoice_number} · ${i.customer_name}`, sub: inr(i.total), href: `/recoverables/invoices/${i.id}` })
  for (const i of si.data ?? [])
    hits.push({ type: 'supplier_invoice', label: i.invoice_number ?? i.payee_name ?? 'Supplier invoice', sub: inr(i.amount), href: '/suppliers/invoices' })
  for (const s of sup.data ?? [])
    hits.push({ type: 'supplier', label: s.name, sub: s.supplier_code ?? 'Supplier', href: '/suppliers/directory' })
  for (const c of cust.data ?? [])
    hits.push({ type: 'customer', label: c.name, sub: 'Customer', href: '/customers/directory' })
  for (const e of emp.data ?? [])
    hits.push({ type: 'employee', label: e.name, sub: e.employee_id ?? 'Employee', href: '/payroll/staff' })

  return NextResponse.json({ hits })
}
