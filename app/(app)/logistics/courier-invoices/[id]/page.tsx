import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import CourierInvoiceDetailClient from '@/components/logistics/courier-invoices/CourierInvoiceDetailClient'
import type { CourierInvoice, AWB } from '@/lib/logistics/types'

export const dynamic = 'force-dynamic'

export default async function CourierInvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: invoice }, { data: awbs }] = await Promise.all([
    supabase
      .from('courier_invoices')
      .select('*')
      .eq('id', id)
      .eq('user_id', user!.id)
      .single(),
    supabase
      .from('awbs')
      .select('*')
      .eq('courier_invoice_id', id)
      .eq('user_id', user!.id)
      .order('shipment_date', { ascending: true }),
  ])

  if (!invoice) notFound()

  return (
    <CourierInvoiceDetailClient
      invoice={invoice as CourierInvoice}
      awbs={(awbs ?? []) as AWB[]}
    />
  )
}
