import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import DocumentForm, { type DocInitial } from '@/components/documents/DocumentForm'
import { docConfigFor } from '@/lib/documents/config'

export const dynamic = 'force-dynamic'

export default async function NewSupplierDocumentPage({
  params, searchParams,
}: { params: Promise<{ type: string }>; searchParams: Promise<{ from?: string; against?: string }> }) {
  const { type } = await params
  const { from, against } = await searchParams
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

  let initial: DocInitial | undefined
  let sourceId: string | null = null
  let againstProp: { id: string; kind: 'supplier_invoice'; number: string } | null = null
  const today = new Date().toISOString().slice(0, 10)

  // Convert from an upstream supplier document (e.g. another doc).
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

  // Debit note raised against a supplier bill.
  if (against) {
    const { data: bill } = await supabase.from('supplier_invoices').select('id, invoice_number, amount, supplier_id, notes').eq('id', against).eq('user_id', uid).maybeSingle()
    if (bill) {
      const num = String(bill.invoice_number || bill.notes || `Bill ${String(bill.id).slice(0, 8)}`)
      againstProp = { id: against, kind: 'supplier_invoice', number: num }
      initial = {
        companyId: companyOpts[0]?.id ?? '', partyId: (bill.supplier_id as string | null) ?? '',
        date: today, reference: num, notes: '', signatoryId: null, number: '',
        lines: [{ item: `Adjustment against ${num}`, hsn: '', qty: '1', rate: String(bill.amount ?? ''), gst: '18' }],
      }
    }
  }

  return (
    <DocumentForm side="supplier" docType={type} companies={companyOpts} parties={parties}
      existing={(existing ?? []) as { company_id: string | null; number: string }[]}
      initial={initial} sourceId={sourceId} sourceKind="document" against={againstProp} />
  )
}
