// Invoices: what the month looks like, then the three ways to make one.
//
// This page used to open on a question. The app already knows the answer —
// consignments imported and not yet billed, expenses paid on a customer's
// behalf and not yet sorted, and what went out last month — so it reads the
// job back instead of asking. Billing happens twelve times a year; nothing
// about it is ever fresh in the mind.
//
// The arithmetic lives in lib/customers/invoiceMonth.ts and is tested there.
// This file only fetches.

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import InvoiceChooser, { type RecentInvoice } from '@/components/customers/invoices/InvoiceChooser'
import { getReimbursableCustomers } from '@/lib/reimbursables/customers'
import {
  monthKey, previousMonth, waitingRows, monthSummary, monthComparison,
  type AllocationLike, type ExpenseLike, type InvoiceLike,
} from '@/lib/customers/invoiceMonth'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Invoices — Inex' }

export default async function InvoicesChooserPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const uid = user.id

  const today = new Date().toISOString().slice(0, 10)
  const month = monthKey(today)
  const lastMonth = previousMonth(month)
  // Three months back, so an invoice raised late for an earlier month is still
  // in the window the summaries are worked out from.
  const windowStart = `${previousMonth(lastMonth)}-01`

  const [{ data: recent }, { data: pendingAllocs }, { data: windowInvoices }, reimbursables] =
    await Promise.all([
      supabase
        .from('recoverable_invoices')
        .select('id, invoice_number, customer_name, invoice_date, total, status, invoice_type')
        .eq('user_id', uid)
        .order('invoice_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(6),
      supabase
        .from('recoverable_allocations')
        .select('customer_name, customer_id, recoverable_amount')
        .eq('user_id', uid)
        .eq('status', 'pending'),
      supabase
        .from('recoverable_invoices')
        .select('id, invoice_number, customer_name, customer_id, invoice_date, invoice_month, total, balance_due, status, due_date')
        .eq('user_id', uid)
        .gte('invoice_date', windowStart),
      getReimbursableCustomers(supabase, uid),
    ])

  // Expenses carried for a customer and not yet billed. The billing columns
  // arrived in a later migration, so a failure here means 'none to show'
  // rather than a broken page.
  const payeeToCustomer = new Map<string, { id: string; name: string }>()
  for (const c of reimbursables) if (c.payee_id) payeeToCustomer.set(c.payee_id, { id: c.id, name: c.name })

  let expenses: ExpenseLike[] = []
  if (payeeToCustomer.size > 0) {
    const { data: txns } = await supabase
      .from('transactions')
      .select('id, amount, payee_id, is_contrast_billed, contrast_billing_category_id')
      .eq('user_id', uid)
      .in('payee_id', Array.from(payeeToCustomer.keys()))
      .or('is_contrast_billed.is.null,is_contrast_billed.eq.false')
    expenses = (txns ?? []).flatMap(t => {
      const cust = payeeToCustomer.get(String(t.payee_id))
      if (!cust) return []
      return [{
        customerId: cust.id,
        customerName: cust.name,
        sorted: t.contrast_billing_category_id != null,
        amount: Math.abs(Number(t.amount) || 0),
      }]
    })
  }

  const allocations: AllocationLike[] = (pendingAllocs ?? []).map(a => ({
    customerId: (a.customer_id as string | null) ?? null,
    customerName: (a.customer_name as string | null) ?? '',
    amount: Number(a.recoverable_amount) || 0,
  }))

  const invoices: InvoiceLike[] = (windowInvoices ?? []).map(i => ({
    id: i.id as string,
    number: (i.invoice_number as string | null) ?? null,
    customerId: (i.customer_id as string | null) ?? null,
    customerName: (i.customer_name as string | null) ?? '',
    date: String(i.invoice_date ?? today),
    month: (i.invoice_month as string | null) ?? null,
    total: Number(i.total) || 0,
    balanceDue: Number(i.balance_due) || 0,
    status: String(i.status ?? 'draft'),
    dueDate: (i.due_date as string | null) ?? null,
  }))

  const now = monthSummary(invoices, month, today)
  const before = monthSummary(invoices, lastMonth, today)

  return (
    <InvoiceChooser
      recent={(recent ?? []) as RecentInvoice[]}
      month={{
        month,
        rows: waitingRows(allocations, expenses, invoices, month),
        now,
        before,
        comparison: monthComparison(now, before),
      }}
    />
  )
}
