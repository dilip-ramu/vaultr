import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import OrderForm, { type OrderInitial } from '@/components/orders/OrderForm'

export const dynamic = 'force-dynamic'

export default async function EditOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const uid = user!.id

  const [{ data: order }, { data: lines }, { data: sizes }, { data: companies }, { data: customers }, { data: existing }] = await Promise.all([
    supabase.from('orders').select('*').eq('id', id).eq('user_id', uid).maybeSingle(),
    supabase.from('order_lines').select('*').eq('order_id', id).order('line_number'),
    supabase.from('order_line_sizes').select('*').eq('order_id', id).order('sort'),
    supabase.from('companies').select('id, name').eq('user_id', uid).order('is_default', { ascending: false }).order('name'),
    supabase.from('customers').select('id, name').eq('user_id', uid).order('name'),
    supabase.from('orders').select('number').eq('user_id', uid),
  ])
  if (!order) notFound()

  const initial: OrderInitial = {
    companyId: (order.company_id as string | null) ?? '',
    customerId: (order.customer_id as string | null) ?? '',
    number: String(order.number),
    customerPoNo: (order.customer_po_no as string | null) ?? '',
    customerPoDate: String(order.customer_po_date ?? '').slice(0, 10),
    orderDate: String(order.order_date ?? '').slice(0, 10),
    currency: String(order.currency ?? 'INR'),
    bookedRate: String(order.booked_rate ?? 1),
    cutoffDate: String(order.cutoff_date ?? '').slice(0, 10),
    etd: String(order.etd ?? '').slice(0, 10),
    notes: (order.notes as string | null) ?? '',
    lines: (lines ?? []).map((l: Record<string, unknown>) => ({
      lineId: String(l.id),
      item: String(l.item ?? ''),
      description: String(l.description ?? ''),
      hsn: String(l.hsn_sac ?? ''),
      qty: String(l.qty ?? ''), sellRate: String(l.sell_rate ?? ''), costRate: String(l.cost_rate ?? ''),
      sizes: (sizes ?? [])
        .filter((s: Record<string, unknown>) => String(s.line_id) === String(l.id))
        .map((s: Record<string, unknown>) => ({ sizeId: String(s.id), label: String(s.label ?? ''), qty: String(s.qty ?? '') })),
    })),
  }

  return (
    <OrderForm
      orderId={id}
      initial={initial}
      companies={(companies ?? []).map(c => ({ id: c.id as string, name: c.name as string }))}
      customers={(customers ?? []).map(c => ({ id: c.id as string, name: c.name as string }))}
      existingNumbers={(existing ?? []).map(e => e.number as string)}
    />
  )
}
