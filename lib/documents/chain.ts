import type { SupabaseClient } from '@supabase/supabase-js'
import type { LinkKind } from './links'

export interface ChainNode {
  key: string
  label: string
  status: 'done' | 'current' | 'pending'
  note?: string
  href: string | null
}

const SELL_STAGES = [
  { type: 'quotation', label: 'Quotation' },
  { type: 'sales_order', label: 'Sales Order' },
  { type: 'proforma_gst', label: 'Proforma' },
  { type: 'delivery_challan', label: 'Delivery Challan' },
  { type: 'tax_invoice', label: 'Tax Invoice' },
]

const BUY_STAGES = [
  { type: 'purchase_order', label: 'Purchase Order' },
  { type: 'supplier_bill', label: 'Supplier Bill' },
  { type: 'debit_note', label: 'Debit Note' },
]

function hrefFor(type: string, id: string): string | null {
  switch (type) {
    case 'tax_invoice': return `/recoverables/invoices/${id}`
    case 'supplier_bill': return `/suppliers/invoices`
    case 'purchase_order':
    case 'debit_note': return `/suppliers/documents/${type}/${id}/edit`
    default: return `/customers/documents/${type}/${id}/edit`
  }
}

/** BFS across 'converted' links to collect every member of this chain and map
 *  each member id to its stage type. */
async function gatherMembers(supabase: SupabaseClient, uid: string, current: { kind: LinkKind; id: string }) {
  const members = new Map<string, { kind: LinkKind; id: string }>()
  const keyOf = (k: string, i: string) => `${k}:${i}`
  members.set(keyOf(current.kind, current.id), current)
  const queue = [current]
  let guard = 0
  while (queue.length && guard++ < 24) {
    const node = queue.shift()!
    const { data: links } = await supabase
      .from('document_links')
      .select('source_kind, source_id, target_kind, target_id')
      .eq('user_id', uid)
      .eq('relation', 'converted')
      .or(`and(source_kind.eq.${node.kind},source_id.eq.${node.id}),and(target_kind.eq.${node.kind},target_id.eq.${node.id})`)
    for (const l of links ?? []) {
      for (const e of [{ kind: l.source_kind as LinkKind, id: l.source_id as string }, { kind: l.target_kind as LinkKind, id: l.target_id as string }]) {
        const k = keyOf(e.kind, e.id)
        if (!members.has(k)) { members.set(k, e); queue.push(e) }
      }
    }
  }

  const docIds = [...members.values()].filter(m => m.kind === 'document').map(m => m.id)
  const typeById = new Map<string, string>()
  if (docIds.length) {
    const { data } = await supabase.from('documents').select('id, doc_type').eq('user_id', uid).in('id', docIds)
    for (const d of data ?? []) typeById.set(d.id as string, d.doc_type as string)
  }
  for (const m of members.values()) {
    if (m.kind === 'recoverable_invoice') typeById.set(m.id, 'tax_invoice')
    if (m.kind === 'supplier_invoice') typeById.set(m.id, 'supplier_bill')
  }

  const idByStage = new Map<string, string>()
  for (const m of members.values()) {
    const t = typeById.get(m.id)
    if (t && !idByStage.has(t)) idByStage.set(t, m.id)
  }
  return idByStage
}

async function buildChain(
  supabase: SupabaseClient, uid: string,
  current: { kind: LinkKind; id: string },
  stages: { type: string; label: string }[],
): Promise<ChainNode[]> {
  const idByStage = await gatherMembers(supabase, uid, current)

  // Real-time payment note on the money stage (tax invoice / supplier bill).
  let invPaid: boolean | null = null
  const invId = idByStage.get('tax_invoice')
  if (invId) {
    const { data } = await supabase.from('recoverable_invoices').select('status, balance_due').eq('id', invId).eq('user_id', uid).maybeSingle()
    if (data) invPaid = data.status === 'paid' || Number(data.balance_due) <= 0
  }
  let billPaid: boolean | null = null
  const billId = idByStage.get('supplier_bill')
  if (billId) {
    const { data } = await supabase.from('supplier_invoices').select('is_paid').eq('id', billId).eq('user_id', uid).maybeSingle()
    if (data) billPaid = !!data.is_paid
  }

  return stages.map(s => {
    const id = idByStage.get(s.type)
    const isCurrent = !!id && id === current.id
    let status: ChainNode['status'] = !id ? 'pending' : isCurrent ? 'current' : 'done'
    let note: string | undefined
    if ((s.type === 'tax_invoice' || s.type === 'supplier_bill') && id) {
      const paid = s.type === 'tax_invoice' ? invPaid : billPaid
      note = paid ? 'Paid' : 'Unpaid'
      if (!isCurrent) status = paid ? 'done' : 'current'
    }
    return { key: s.type, label: s.label, status, note, href: id && !isCurrent ? hrefFor(s.type, id) : null }
  })
}

export function resolveSellChain(supabase: SupabaseClient, uid: string, current: { kind: LinkKind; id: string }) {
  return buildChain(supabase, uid, current, SELL_STAGES)
}
export function resolveBuyChain(supabase: SupabaseClient, uid: string, current: { kind: LinkKind; id: string }) {
  return buildChain(supabase, uid, current, BUY_STAGES)
}
