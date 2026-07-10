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
  const { data: docs } = await supabase.from('documents').select('*')
    .eq('user_id', user!.id).eq('doc_type', type).eq('party_kind', 'supplier')
    .order('date', { ascending: false })

  return (
    <div className="w-full px-4 md:px-8 py-6">
      <DocumentsClient side="supplier" lockedType={type} initialDocs={(docs ?? []) as DocumentRow[]} />
    </div>
  )
}
