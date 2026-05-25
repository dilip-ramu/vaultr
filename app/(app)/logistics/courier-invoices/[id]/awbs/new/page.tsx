import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AWBForm from '@/components/logistics/awbs/AWBForm'

export const dynamic = 'force-dynamic'

export default async function NewAWBPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: courierId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Verify the courier invoice belongs to this user
  const { data: invoice } = await supabase
    .from('courier_invoices')
    .select('id')
    .eq('id', courierId)
    .eq('user_id', user!.id)
    .single()

  if (!invoice) notFound()

  return <AWBForm courierId={courierId} />
}
