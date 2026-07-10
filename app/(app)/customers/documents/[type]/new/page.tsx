import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import DocumentForm, { type DocInitial } from '@/components/documents/DocumentForm'
import { docConfigFor } from '@/lib/documents/config'

export const dynamic = 'force-dynamic'

export default async function NewCustomerDocumentPage({
  params, searchParams,
}: { params: Promise<{ type: string }>; searchParams: Promise<{ from?: string; against?: string }> }) {
  const { type } = await params
  const { from, against } = await searchParams
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

  let initial: DocInitial | undefined
  let sourceId: string | null = null
  let againstProp: { id: string; kind: 'recoverable_invoice'; number: string } | null = null
  const today = new Date().toISOString().slice(0, 10)

  // Convert from an upstream document.
  if (from) {
    const [{ data: src }, { data: sl }] = await Promise.all([
      supabase.from('documents').select('*').eq('id', from).eq('user_id', uid).maybeSingle(),
      supabase.from('document_lines').select('*').eq('document_id', from).order('line_number', { ascending: true }),
    ])
    if (src) {
      sourceId = from
      initial = {
        companyId: (src.company_id as string | null) ?? '', partyId: (src.party_id as string | null) ?? '',
        date: today, reference: (src.reference as string | null) ?? '', notes: (src.notes as string | null) ?? '',
        signatoryId: (src.signatory_id as string | null) ?? null, number: '',
        lines: (sl ?? []).map((l: Record<string, unknown>) => ({ item: String(l.item ?? ''), hsn: String(l.hsn_sac ?? ''), qty: String(l.qty ?? '1'), rate: String(l.rate ?? ''), gst: String(l.gst_rate ?? 18) })),
      }
    }
  }

  // Credit note raised against a tax invoice.
  if (against) {
    const [{ data: inv }, { data: il }] = await Promise.all([
      supabase.from('recoverable_invoices').select('*').eq('id', against).eq('user_id', uid).maybeSingle(),
      supabase.from('recoverable_invoice_lines').select('*').eq('invoice_id', against).order('line_number', { ascending: true }),
    ])
    if (inv) {
      againstProp = { id: against, kind: 'recoverable_invoice', number: String(inv.invoice_number ?? '') }
      initial = {
        companyId: (inv.company_id as string | null) ?? '', partyId: (inv.customer_id as string | null) ?? '',
        date: today, reference: String(inv.invoice_number ?? ''), notes: '',
        signatoryId: (inv.signatory_id as string | null) ?? null, number: '',
        lines: (il ?? []).map((l: Record<string, unknown>) => ({ item: String(l.description ?? l.awb ?? ''), hsn: String(l.hsn_sac ?? ''), qty: String(l.qty ?? '1'), rate: String(l.rate ?? ''), gst: String((Number(l.cgst_rate) || 9) + (Number(l.sgst_rate) || 9)) })),
      }
    }
  }

  return (
    <DocumentForm side="customer" docType={type} companies={companyOpts} parties={parties}
      existing={(existing ?? []) as { company_id: string | null; number: string }[]}
      initial={initial} sourceId={sourceId} sourceKind="document" against={againstProp} />
  )
}
