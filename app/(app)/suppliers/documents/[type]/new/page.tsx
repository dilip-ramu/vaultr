import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import DocumentForm, { type DocInitial } from '@/components/documents/DocumentForm'
import { docConfigFor } from '@/lib/documents/config'
import { orderDocLines } from '@/lib/orders/toDocument'

export const dynamic = 'force-dynamic'

export default async function NewSupplierDocumentPage({
  params, searchParams,
}: { params: Promise<{ type: string }>; searchParams: Promise<{ from?: string; against?: string; fromOrder?: string }> }) {
  const { type } = await params
  const { from, against, fromOrder } = await searchParams
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

  // ── Raised from an order ──────────────────────────────────────────────────
  // The styles, the spec, the size breakdown and the rate you agreed are
  // already on the order. Retyping them is how the supplier ends up being
  // told something different from what the customer agreed. The supplier
  // itself is NOT guessed — an order can be bought from more than one.
  let orderId: string | null = null
  if (fromOrder) {
    const [{ data: ord }, { data: ol }] = await Promise.all([
      supabase.from('orders').select('*').eq('id', fromOrder).eq('user_id', uid).maybeSingle(),
      supabase.from('order_lines').select('*').eq('order_id', fromOrder).order('line_number', { ascending: true }),
    ])
    if (ord) {
      orderId = fromOrder
      const ids = (ol ?? []).map((l: Record<string, unknown>) => String(l.id))
      const { data: sizes } = ids.length
        ? await supabase.from('order_line_sizes').select('*').in('line_id', ids).order('sort', { ascending: true })
        : { data: [] as Record<string, unknown>[] }
      const sizesByLine = new Map<string, { label: string; qty: number }[]>()
      for (const s of sizes ?? []) {
        const row = s as Record<string, unknown>
        const k = String(row.line_id)
        const list = sizesByLine.get(k) ?? []
        list.push({ label: String(row.label ?? ''), qty: Number(row.qty) || 0 })
        sizesByLine.set(k, list)
      }
      initial = {
        companyId: (ord.company_id as string | null) ?? '',
        partyId: '',
        date: today,
        reference: (ord.customer_po_no as string | null) ?? String(ord.number ?? ''),
        notes: '',
        signatoryId: null,
        number: '',
        lines: orderDocLines((ol ?? []).map((l: Record<string, unknown>) => ({
          item: String(l.item ?? ''),
          description: (l.description as string | null) ?? null,
          hsn: (l.hsn_sac as string | null) ?? null,
          qty: Number(l.qty) || 0,
          sellRate: Number(l.sell_rate) || 0,
          costRate: Number(l.cost_rate) || 0,
          sizes: sizesByLine.get(String(l.id)) ?? [],
        })), 'cost'),
      }
    }
  }

  return (
    <DocumentForm side="supplier" docType={type} companies={companyOpts} parties={parties}
      existing={(existing ?? []) as { company_id: string | null; number: string }[]}
      initial={initial} sourceId={sourceId} sourceKind="document" against={againstProp} orderId={orderId} />
  )
}
