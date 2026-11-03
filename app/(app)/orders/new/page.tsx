import { createClient } from '@/lib/supabase/server'
import OrderForm from '@/components/orders/OrderForm'

export const dynamic = 'force-dynamic'

export default async function NewOrderPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const uid = user!.id

  const [{ data: companies }, { data: customers }, { data: existing }] = await Promise.all([
    supabase.from('companies').select('id, name').eq('user_id', uid).order('is_default', { ascending: false }).order('name'),
    supabase.from('customers').select('id, name').eq('user_id', uid).order('name'),
    supabase.from('orders').select('number').eq('user_id', uid),
  ])

  return (
    <OrderForm
      companies={(companies ?? []).map(c => ({ id: c.id as string, name: c.name as string }))}
      customers={(customers ?? []).map(c => ({ id: c.id as string, name: c.name as string }))}
      existingNumbers={(existing ?? []).map(e => e.number as string)}
    />
  )
}
