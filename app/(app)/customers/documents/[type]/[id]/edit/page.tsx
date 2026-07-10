import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import DocumentForm, { type DocInitial } from '@/components/documents/DocumentForm'
import { docConfigFor } from '@/lib/documents/config'

export const dynamic = 'force-dynamic'

export default async function EditCustomerDocumentPage({ params }: { params: Promise<{ type: string; id: string }> }) {
  const { type, id } = await params
  const cfg = docConfigFor(type, 'customer')
  if (!cfg || cfg.side !== 'customer') notFound()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const uid = user!.id

  const [{ data: doc }, { data: lines }, { data: companies }, { data: customers }, { data: existing }] = await Promise.all([
    supabase.from('documents').select('*').eq('id', id).eq('user_id', uid).maybeSingle(),
    supabase.from('document_lines').select('*').eq('document_id', id).order('line_number', { ascending: true }),
    supabase.from('companies').select('id, name, invoice_prefix').eq('user_id', uid).order('is_default', { ascending: false }).order('name'),
    supabase.from('customers').select('id, name, gst_number, address, state, city').eq('user_id', uid).order('name'),
    supabase.from('documents').select('company_id, number').eq('user_id', uid).eq('doc_type', type).eq('party_kind', 'customer'),
  ])
  if (!doc || doc.doc_type !== type || doc.party_kind !== 'customer') notFound()

  const companyOpts = (companies ?? []).map(c => ({ id: c.id as string, name: c.name as string, prefix: (c.invoice_prefix as string | null) ?? '' }))
  const parties = (customers ?? []).map(c => ({ id: c.id as string, name: c.name as string, gstin: (c.gst_number as string | null) ?? null, address: (c.address as string | null) ?? null, state: ((c.state as string | null) || (c.city as string | null)) ?? null }))

  const initial: DocInitial = {
    companyId: (doc.company_id as string | null) ?? '',
    partyId: (doc.party_id as string | null) ?? '',
    date: String(doc.date ?? '').slice(0, 10),
    reference: (doc.reference as string | null) ?? '',
    notes: (doc.notes as string | null) ?? '',
    signatoryId: (doc.signatory_id as string | null) ?? null,
    number: String(doc.number ?? ''),
    lines: (lines ?? []).map((l: Record<string, unknown>) => ({ item: String(l.item ?? ''), hsn: String(l.hsn_sac ?? ''), qty: String(l.qty ?? '1'), rate: String(l.rate ?? ''), gst: String(l.gst_rate ?? 18) })),
  }

  return (
    <DocumentForm side="customer" docType={type} docId={id} initial={initial} companies={companyOpts} parties={parties} existing={(existing ?? []) as { company_id: string | null; number: string }[]} />
  )
}
