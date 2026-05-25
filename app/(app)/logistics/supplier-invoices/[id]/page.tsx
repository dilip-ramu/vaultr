import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import type { SupplierInvoice, SupplierInvoiceLine } from '@/lib/logistics/types'
import type { Customer, Account } from '@/lib/types'
import SupplierInvoiceDetail from '@/components/logistics/supplier-invoices/SupplierInvoiceDetail'

export const dynamic = 'force-dynamic'

export default async function SupplierInvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [invoiceRes, accountsRes] = await Promise.all([
    supabase
      .from('supplier_invoices')
      .select(`
        *,
        customer:customers(id, user_id, household_id, name, email, phone, address, gst_number, notes, created_at),
        lines:supplier_invoice_lines(*)
      `)
      .eq('id', id)
      .eq('user_id', user!.id)
      .single(),
    supabase
      .from('account_balances')
      .select('*')
      .eq('user_id', user!.id),
  ])

  if (!invoiceRes.data) notFound()

  const invoiceData = invoiceRes.data
  const invoice = {
    ...invoiceData,
    customer: undefined,
    lines: undefined,
  } as SupplierInvoice

  const customer = invoiceData.customer as Customer
  const lines = ((invoiceData.lines ?? []) as SupplierInvoiceLine[]).sort(
    (a, b) => a.sort_order - b.sort_order
  )
  const accounts = (accountsRes.data ?? []) as unknown as Account[]

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
      <div className="flex items-center gap-3">
        <Link
          href="/logistics/supplier-invoices"
          style={{ color: 'var(--text-muted)' }}
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-base font-bold" style={{ color: 'var(--text)' }}>
          Invoice Detail
        </h1>
      </div>

      <SupplierInvoiceDetail
        invoice={invoice}
        lines={lines}
        customer={customer}
        accounts={accounts}
        currency={invoice.currency}
      />
    </div>
  )
}
