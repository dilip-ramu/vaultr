import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import DocumentForm from '@/components/documents/DocumentForm'
import { docConfigFor } from '@/lib/documents/config'

export const dynamic = 'force-dynamic'

export default async function NewSupplierDocumentPage({ params }: { params: Promise<{ type: string }> }) {
  const { type } = await params
  const cfg = docConfigFor(type, 'supplier')
  if (!cfg || cfg.side !== 'supplier') notFound()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const uid = user!.id

  const [{ data: companies }, { data: suppliers }, { data: existing }] = await Promise.all([
    supabase.from('companies').select('id, name, invoice_prefix').eq('user_id', uid).order('is_default', { ascending: false }).order('name'),
    supabase.from('suppliers').select('id, name, gst_number, address').eq('user_id', uid).eq('is_active', true).order('name'),
    supabase.from('documents').select('company_id, number').eq('user_id', uid).eq('doc_type', type).eq('party_kind', 'supplier'),
  ])

  const companyOpts = (companies ?? []).map(c => ({ id: c.id as string, name: c.name as string, prefix: (c.invoice_prefix as string | null) ?? '' }))
  const parties = (suppliers ?? []).map(s => ({ id: s.id as string, name: s.name as string, gstin: (s.gst_number as string | null) ?? null, address: (s.address as string | null) ?? null, state: null }))

  return (
    <DocumentForm side="supplier" docType={type} companies={companyOpts} parties={parties} existing={(existing ?? []) as { company_id: string | null; number: string }[]} />
  )
}
