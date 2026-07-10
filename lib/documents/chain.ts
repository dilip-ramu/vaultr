import type { SupabaseClient } from '@supabase/supabase-js'
import type { LinkKind } from './links'

export interface ChainNode {
  key: string
  label: string
  status: 'done' | 'current' | 'pending'
  note?: string          // e.g. 'Paid' / 'Unpaid' on the invoice node
  href: string | null
}

// The sell-side chain, in order.
const SELL_STAGES: { type: string; label: string }[] = [
  { type: 'quotation', label: 'Quotation' },
  { type: 'sales_order', label: 'Sales Order' },
  { type: 'proforma_gst', label: 'Proforma' },
  { type: 'delivery_challan', label: 'Delivery Challan' },
  { type: 'tax_invoice', label: 'Tax Invoice' },
]

function hrefFor(type: string, id: string): string {
  if (type === 'tax_invoice') return `/recoverables/invoices/${id}`
  return `/customers/documents/${type}/${id}/edit`
}

/**
 * Resolve the full converted-chain a document/invoice belongs to and return the
 * sell-side stages with per-stage status: done (exists, not current), current
 * (the one you opened), pending (not created yet).
 */
export async function resolveSellChain(
  supabase: SupabaseClient,
  uid: string,
  current: { kind: LinkKind; id: string },
): Promise<ChainNode[]> {
  // BFS across 'converted' links to gather every member of this chain.
  const members = new Map<string, { kind: LinkKind; id: string }>()
  const keyOf = (k: string, i: string) => `${k}:${i}`
  members.set(keyOf(current.kind, current.id), current)
  const queue = [current]
  let guard = 0
  while (queue.length && guard++ < 20) {
    const node = queue.shift()!
    const { data: links } = await supabase
      .from('document_links')
      .select('source_kind, source_id, target_kind, target_id')
      .eq('user_id', uid)
      .eq('relation', 'converted')
      .or(`and(source_kind.eq.${node.kind},source_id.eq.${node.id}),and(target_kind.eq.${node.kind},target_id.eq.${node.id})`)
    for (const l of links ?? []) {
      const ends: { kind: LinkKind; id: string }[] = [
        { kind: l.source_kind as LinkKind, id: l.source_id as string },
        { kind: l.target_kind as LinkKind, id: l.target_id as string },
      ]
      for (const e of ends) {
        const k = keyOf(e.kind, e.id)
        if (!members.has(k)) { members.set(k, e); queue.push(e) }
      }
    }
  }

  // Resolve each member's stage type.
  const docIds = [...members.values()].filter(m => m.kind === 'document').map(m => m.id)
  const invIds = [...members.values()].filter(m => m.kind === 'recoverable_invoice').map(m => m.id)
  const typeById = new Map<string, string>()   // member id → stage type
  if (docIds.length) {
    const { data } = await supabase.from('documents').select('id, doc_type').eq('user_id', uid).in('id', docIds)
    for (const d of data ?? []) typeById.set(d.id as string, d.doc_type as string)
  }
  for (const id of invIds) typeById.set(id, 'tax_invoice')

  // stage type → member id (first found)
  const idByStage = new Map<string, string>()
  for (const [, m] of members) {
    const t = typeById.get(m.id)
    if (t && !idByStage.has(t)) idByStage.set(t, m.id)
  }

  // Real-time payment state of the invoice in this chain, if any.
  let invoicePaid: boolean | null = null
  const invId = idByStage.get('tax_invoice')
  if (invId) {
    const { data: inv } = await supabase.from('recoverable_invoices').select('status, balance_due').eq('id', invId).eq('user_id', uid).maybeSingle()
    if (inv) invoicePaid = inv.status === 'paid' || Number(inv.balance_due) <= 0
  }

  // Existence-based, real-time: a stage that exists is done (green); the one you
  // opened is current (amber); stages not yet created are pending (red). The tax
  // invoice additionally shows Paid (green) vs Unpaid (amber).
  return SELL_STAGES.map(s => {
    const id = idByStage.get(s.type)
    const isCurrent = !!id && id === current.id
    let status: ChainNode['status']
    let note: string | undefined
    if (!id) status = 'pending'
    else if (isCurrent) status = 'current'
    else status = 'done'

    if (s.type === 'tax_invoice' && id) {
      note = invoicePaid ? 'Paid' : 'Unpaid'
      if (!isCurrent) status = invoicePaid ? 'done' : 'current'   // unpaid invoice → amber
    }
    return { key: s.type, label: s.label, status, note, href: id && !isCurrent ? hrefFor(s.type, id) : null }
  })
}
