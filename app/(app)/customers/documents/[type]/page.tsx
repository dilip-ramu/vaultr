import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import DocumentsClient from '@/components/documents/DocumentsClient'
import { docConfigFor, type DocumentRow } from '@/lib/documents/config'

export const dynamic = 'force-dynamic'

export default async function CustomerDocumentTypePage({ params }: { params: Promise<{ type: string }> }) {
  const { type } = await params
  const cfg = docConfigFor(type, 'customer')
  if (!cfg || cfg.side !== 'customer') notFound()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const uid = user!.id

  const [{ data: companies }, { data: customers }, { data: docs }] = await Promise.all([
    supabase.from('companies').select('id, name').eq('user_id', uid).order('is_default', { ascending: false }).order('name'),
    supabase.from('customers').select('id, name, gst_number, address, state, city').eq('user_id', uid).order('name'),
    // Filter by doc_type AND party_kind — delivery_challan is shared with suppliers.
    supabase.from('documents').select('*').eq('user_id', uid).eq('doc_type', type).eq('party_kind', 'customer').order('date', { ascending: false }),
  ])

  const parties = (customers ?? []).map(c => ({ id: c.id as string, name: c.name as string, gstin: (c.gst_number as string | null) ?? null, address: (c.address as string | null) ?? null, state: ((c.state as string | null) || (c.city as string | null)) ?? null }))

  return (
    <div className="w-full px-4 md:px-8 py-6">
      <DocumentsClient side="customer" lockedType={type} companies={(companies ?? []) as { id: string; name: string }[]} parties={parties} initialDocs={(docs ?? []) as DocumentRow[]} />
    </div>
  )
}
