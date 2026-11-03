import { createClient } from '@/lib/supabase/server'
import { upgradeLayout } from '@/lib/documents/layout'
import { redirect, notFound } from 'next/navigation'
import DocPrintView from '@/components/documents/DocPrintView'
import { buildDocumentModel, DOC_META } from '@/lib/documents/buildModel'

type Props = { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()
  const { data } = await supabase.from('documents').select('number').eq('id', id).maybeSingle()
  return { title: (data as { number: string } | null)?.number ?? 'Document' }
}

export default async function DocumentPrintPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // The model is built in one shared place (lib/documents/buildModel) so the
  // purchase order inside a supplier pack is byte-for-byte the one on screen.
  const built = await buildDocumentModel(supabase, user.id, id)
  if (!built) notFound()

  // Custom per-company template for this format, if one has been designed.
  let layout: import('@/lib/documents/layout').DocLayout | null = null
  if (built.companyId) {
    const { data: lay } = await supabase.from('document_layouts').select('schema')
      .eq('user_id', user.id).eq('company_id', built.companyId).eq('format', built.docType).maybeSingle()
    const title = DOC_META[built.docType]?.title ?? built.model.title
    layout = upgradeLayout((lay?.schema as import('@/lib/documents/layout').DocLayout | null) ?? null, built.docType, title)
  }

  return <DocPrintView model={built.model} filename={`${built.number}.pdf`} layout={layout} />
}
