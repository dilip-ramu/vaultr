import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AWBDetail from '@/components/logistics/awbs/AWBDetail'
import type { AWB, AWBAllocation, MarkupRule } from '@/lib/logistics/types'

export const dynamic = 'force-dynamic'

export default async function AWBDetailPage({
  params,
}: {
  params: Promise<{ id: string; awbId: string }>
}) {
  const { id: courierId, awbId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [
    { data: awb },
    { data: allocations },
    { data: markupRules },
    { data: courierInvoice },
  ] = await Promise.all([
    supabase
      .from('awbs')
      .select('*')
      .eq('id', awbId)
      .eq('courier_invoice_id', courierId)
      .eq('user_id', user!.id)
      .single(),
    supabase
      .from('awb_allocations')
      .select('*, customer:customers(id,name,email,phone)')
      .eq('awb_id', awbId)
      .eq('user_id', user!.id)
      .order('created_at'),
    supabase
      .from('markup_rules')
      .select('*')
      .eq('user_id', user!.id)
      .eq('is_active', true),
    supabase
      .from('courier_invoices')
      .select('currency')
      .eq('id', courierId)
      .eq('user_id', user!.id)
      .single(),
  ])

  if (!awb) notFound()

  return (
    <AWBDetail
      awb={awb as AWB}
      courierId={courierId}
      currency={courierInvoice?.currency ?? 'INR'}
      allocations={(allocations ?? []) as AWBAllocation[]}
      markupRules={(markupRules ?? []) as MarkupRule[]}
    />
  )
}
