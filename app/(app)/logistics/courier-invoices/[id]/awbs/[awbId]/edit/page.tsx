import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AWBForm from '@/components/logistics/awbs/AWBForm'
import type { AWB } from '@/lib/logistics/types'

export const dynamic = 'force-dynamic'

export default async function EditAWBPage({
  params,
}: {
  params: Promise<{ id: string; awbId: string }>
}) {
  const { id: courierId, awbId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: awb } = await supabase
    .from('awbs')
    .select('*')
    .eq('id', awbId)
    .eq('courier_invoice_id', courierId)
    .eq('user_id', user!.id)
    .single()

  if (!awb) notFound()

  return <AWBForm courierId={courierId} awb={awb as AWB} />
}
