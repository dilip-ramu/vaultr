import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import DocumentForm from '@/components/documents/DocumentForm'
import { docConfigFor } from '@/lib/documents/config'

export const dynamic = 'force-dynamic'

export default async function NewCustomerDocumentPage({ params }: { params: Promise<{ type: string }> }) {
  const { type } = await params
  const cfg = docConfigFor(type, 'customer')
  if (!cfg || cfg.side !== 'customer') notFound()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const uid = user!.id

  const [{ data: companies }, { data: customers }, { data: existing }] = await Promise.all([
    supabase.from('companies').select('id, name, invoice_prefix').eq('user_id', uid).order('is_default', { ascending: false }).order('name'),
    supabase.from('customers').select('id, name, gst_number, address, state, city').eq('user_id', uid).order('name'),
    supabase.from('documents').select('company_id, number').eq('user_id', uid).eq('doc_type', type).eq('party_kind', 'customer'),
  ])

  const companyOpts = (companies ?? []).map(c => ({ id: c.id as string, name: c.name as string, prefix: (c.invoice_prefix as string | null) ?? '' }))
  const parties = (customers ?? []).map(c => ({ id: c.id as string, name: c.name as string, gstin: (c.gst_number as string | null) ?? null, address: (c.address as string | null) ?? null, state: ((c.state as string | null) || (c.city as string | null)) ?? null }))

  return (
    <DocumentForm side="customer" docType={type} companies={companyOpts} parties={parties} existing={(existing ?? []) as { company_id: string | null; number: string }[]} />
  )
}
