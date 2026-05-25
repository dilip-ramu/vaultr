import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Plus, FileText } from 'lucide-react'
import type { SupplierInvoice } from '@/lib/logistics/types'
import type { Customer, Account } from '@/lib/types'
import { formatCurrency, formatDate } from '@/lib/utils'
import InvoiceStatusBadge from '@/components/logistics/supplier-invoices/InvoiceStatusBadge'
import SupplierInvoiceGenerator from '@/components/logistics/supplier-invoices/SupplierInvoiceGenerator'

export const dynamic = 'force-dynamic'

export default async function SupplierInvoicesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const thisMonthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    .toISOString()
    .split('T')[0]

  const [invoicesRes, uninvoicedRes, customersRes, accountsRes] = await Promise.all([
    supabase
      .from('supplier_invoices')
      .select('*, customer:customers(id, name)')
      .eq('user_id', user!.id)
      .order('created_at', { ascending: false })
      .limit(50),

    // Allocations with AWB data that are not yet invoiced
    supabase
      .from('awb_allocations')
      .select(`
        id, user_id, customer_id, awb_id,
        pieces, weight_kg, billed_amount, override_amount,
        markup_type, markup_value, minimum_amount,
        base_cost, markup_amount, supplier_invoice_id, invoiced_at,
        override_reason, notes, created_at, updated_at,
        awb:awbs(awb_number, shipment_date, destination_city, destination_country)
      `)
      .eq('user_id', user!.id)
      .is('supplier_invoice_id', null)
      .order('created_at'),

    supabase
      .from('customers')
      .select('id, user_id, household_id, name, email, phone, address, gst_number, notes, created_at')
      .eq('user_id', user!.id)
      .order('name'),

    supabase
      .from('account_balances')
      .select('*')
      .eq('user_id', user!.id),
  ])

  const invoices = (invoicesRes.data ?? []) as (SupplierInvoice & { customer?: { id: string; name: string } })[]
  const customers = (customersRes.data ?? []) as Customer[]
  const accounts = (accountsRes.data ?? []) as unknown as Account[]

  // Flatten AWB join fields onto each allocation
  const uninvoicedAllocations = (uninvoicedRes.data ?? []).map((a) => {
    const awb = a.awb as unknown as { awb_number: string; shipment_date: string | null; destination_city: string | null; destination_country: string | null } | null
    return {
      id: a.id,
      user_id: a.user_id,
      customer_id: a.customer_id,
      awb_id: a.awb_id,
      pieces: a.pieces,
      weight_kg: a.weight_kg,
      billed_amount: a.billed_amount,
      override_amount: a.override_amount,
      markup_type: a.markup_type,
      markup_value: a.markup_value,
      minimum_amount: a.minimum_amount,
      base_cost: a.base_cost,
      markup_amount: a.markup_amount,
      supplier_invoice_id: null,
      invoiced_at: null,
      override_reason: a.override_reason,
      notes: a.notes,
      created_at: a.created_at,
      updated_at: a.updated_at,
      awb_number: awb?.awb_number ?? '',
      shipment_date: awb?.shipment_date ?? null,
      destination_city: awb?.destination_city ?? null,
      destination_country: awb?.destination_country ?? null,
    }
  })

  // Summary stats
  const outstanding = invoices
    .filter(i => i.status === 'sent' || i.status === 'overdue')
    .reduce((s, i) => s + i.total_amount - i.paid_amount, 0)
  const paidThisMonth = invoices
    .filter(i => i.status === 'paid' && i.paid_at && i.paid_at >= thisMonthStart)
    .reduce((s, i) => s + i.paid_amount, 0)

  return (
    <div className="page-enter max-w-2xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold" style={{ color: 'var(--text)' }}>Supplier Invoices</h1>
        <Link href="/logistics" className="text-sm font-medium" style={{ color: 'var(--brand)' }}>
          ← Logistics
        </Link>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="card p-4">
          <p className="text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Outstanding</p>
          <p className="text-lg font-bold tabular-nums" style={{ color: outstanding > 0 ? 'var(--expense)' : 'var(--text)' }}>
            {formatCurrency(outstanding)}
          </p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Paid this month</p>
          <p className="text-lg font-bold tabular-nums" style={{ color: 'var(--income)' }}>
            {formatCurrency(paidThisMonth)}
          </p>
        </div>
      </div>

      {/* Generator (collapsible) */}
      {uninvoicedAllocations.length > 0 && (
        <div className="card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Plus className="w-4 h-4" style={{ color: 'var(--brand)' }} />
            <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Generate New Invoice</p>
            <span
              className="ml-auto text-xs font-semibold px-2 py-0.5 rounded-lg"
              style={{ backgroundColor: 'var(--brand-light)', color: 'var(--brand)' }}
            >
              {uninvoicedAllocations.length} pending
            </span>
          </div>
          <SupplierInvoiceGenerator
            customers={customers}
            uninvoicedAllocations={uninvoicedAllocations}
            accounts={accounts}
          />
        </div>
      )}

      {/* Invoice list */}
      <div className="space-y-3">
        <p className="text-sm font-semibold px-1" style={{ color: 'var(--text)' }}>
          All Invoices ({invoices.length})
        </p>

        {invoices.length === 0 ? (
          <div className="card p-8 flex flex-col items-center gap-4 text-center">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ backgroundColor: 'var(--brand-light)' }}>
              <FileText className="w-7 h-7" style={{ color: 'var(--brand)' }} />
            </div>
            <div>
              <p className="font-semibold mb-1" style={{ color: 'var(--text)' }}>No invoices generated yet</p>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                Workflow: Upload courier invoice → Add AWBs → Allocate to customers → Generate supplier invoice.
              </p>
            </div>
            <Link
              href="/logistics/courier-invoices"
              className="px-4 py-2.5 rounded-xl text-sm font-semibold text-white"
              style={{ backgroundColor: 'var(--brand)' }}
            >
              View Courier Invoices
            </Link>
          </div>
        ) : (
          <div className="card overflow-hidden [&>a:first-child]:border-t-0">
            {invoices.map(inv => (
              <Link
                key={inv.id}
                href={`/logistics/supplier-invoices/${inv.id}`}
                className="tap-scale flex items-center gap-3 px-4 py-3.5 border-t hover:bg-[var(--surface-2)] active:bg-[var(--surface-2)] transition-colors"
                style={{ borderColor: 'var(--border)' }}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-mono text-sm font-bold" style={{ color: 'var(--text)' }}>
                      {inv.invoice_number}
                    </p>
                    <InvoiceStatusBadge status={inv.status} />
                  </div>
                  <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>
                    {inv.customer?.name ?? '—'} · {formatDate(inv.invoice_date)}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-bold tabular-nums" style={{ color: 'var(--income)' }}>
                    {formatCurrency(inv.total_amount, inv.currency)}
                  </p>
                  {inv.due_date && (inv.status === 'sent' || inv.status === 'overdue') && (
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-faint)' }}>
                      due {formatDate(inv.due_date)}
                    </p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
