import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import DocumentsClient from '@/components/documents/DocumentsClient'
import { docConfigFor, type DocumentRow } from '@/lib/documents/config'

export const dynamic = 'force-dynamic'

export default async function SupplierDocumentTypePage({ params }: { params: Promise<{ type: string }> }) {
  const { type } = await params
  const cfg = docConfigFor(type, 'supplier')
  if (!cfg || cfg.side !== 'supplier') notFound()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const uid = user!.id

  const [{ data: companies }, { data: suppliers }, { data: docs }] = await Promise.all([
    supabase.from('companies').select('id, name').eq('user_id', uid).order('is_default', { ascending: false }).order('name'),
    supabase.from('suppliers').select('id, name, gst_number, address').eq('user_id', uid).eq('is_active', true).order('name'),
    supabase.from('documents').select('*').eq('user_id', uid).eq('doc_type', type).eq('party_kind', 'supplier').order('date', { ascending: false }),
  ])

  const parties = (suppliers ?? []).map(s => ({ id: s.id as string, name: s.name as string, gstin: (s.gst_number as string | null) ?? null, address: (s.address as string | null) ?? null, state: null }))

  return (
    <div className="w-full px-4 md:px-8 py-6">
      <DocumentsClient side="supplier" lockedType={type} companies={(companies ?? []) as { id: string; name: string }[]} parties={parties} initialDocs={(docs ?? []) as DocumentRow[]} />
    </div>
  )
}
