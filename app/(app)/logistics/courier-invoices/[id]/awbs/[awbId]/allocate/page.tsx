import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import AllocationTable from '@/components/logistics/allocations/AllocationTable'
import type { AWB, AWBAllocation, MarkupRule } from '@/lib/logistics/types'
import type { Customer } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function AllocatePage({
  params,
}: {
  params: Promise<{ id: string; awbId: string }>
}) {
  const { id: courierId, awbId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [awbRes, allocRes, rulesRes, customersRes, invoiceRes] = await Promise.all([
    supabase
      .from('awbs')
      .select('*')
      .eq('id', awbId)
      .eq('user_id', user!.id)
      .single(),
    supabase
      .from('awb_allocations')
      .select('*, customer:customers(id, user_id, household_id, name, email, phone, address, gst_number, notes, created_at)')
      .eq('awb_id', awbId)
      .eq('user_id', user!.id)
      .order('created_at'),
    supabase
      .from('markup_rules')
      .select('*')
      .eq('user_id', user!.id)
      .eq('is_active', true),
    supabase
      .from('customers')
      .select('id, user_id, household_id, name, email, phone, address, gst_number, notes, created_at')
      .eq('user_id', user!.id)
      .order('name'),
    supabase
      .from('courier_invoices')
      .select('currency')
      .eq('id', courierId)
      .eq('user_id', user!.id)
      .single(),
  ])

  if (!awbRes.data) notFound()

  const awb = awbRes.data as AWB
  const allocations = (allocRes.data ?? []) as AWBAllocation[]
  const markupRules = (rulesRes.data ?? []) as MarkupRule[]
  const customers = (customersRes.data ?? []) as Customer[]
  const currency = invoiceRes.data?.currency ?? 'INR'

  const destination = [awb.destination_city, awb.destination_country].filter(Boolean).join(', ')

  return (
    <div className="page-enter max-w-2xl mx-auto px-4 py-6 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href={`/logistics/courier-invoices/${courierId}/awbs/${awbId}`}
          style={{ color: 'var(--text-muted)' }}
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="font-mono text-lg font-bold tracking-tight" style={{ color: 'var(--text)' }}>
            {awb.awb_number}
          </h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Allocate · {awb.total_pieces} PCS
            {destination ? ` · ${destination}` : ''}
          </p>
        </div>
      </div>

      <AllocationTable
        awb={awb}
        initialAllocations={allocations}
        markupRules={markupRules}
        customers={customers}
        currency={currency}
      />
    </div>
  )
}
