import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// POST — convert a Purchase Order (documents row) into a DRAFT supplier bill
// (supplier_invoices row). Purely additive: it inserts a normal supplier bill
// (which can later be bundled/paid as usual) and records the chain link. It
// does not touch the courier / reimbursable / bundling logic.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: po } = await supabase.from('documents').select('*').eq('id', id).eq('user_id', user.id).maybeSingle()
  if (!po || po.doc_type !== 'purchase_order') return NextResponse.json({ error: 'Purchase order not found' }, { status: 404 })
  if (!po.party_id) return NextResponse.json({ error: 'This PO has no supplier linked' }, { status: 400 })

  // Draft bill — supplier's own invoice number is unknown until the bill arrives.
  const { data: bill, error } = await supabase.from('supplier_invoices').insert({
    user_id: user.id,
    supplier_id: po.party_id,
    invoice_number: null,
    invoice_date: new Date().toISOString().slice(0, 10),
    amount: Number(po.total) || 0,
    currency: 'INR',
    notes: `From PO ${po.number}`,
    status: 'pending',
  }).select('id').single()
  if (error || !bill) return NextResponse.json({ error: error?.message ?? 'Could not create the bill' }, { status: 500 })

  await supabase.from('document_links').insert({
    user_id: user.id, source_kind: 'document', source_id: id,
    target_kind: 'supplier_invoice', target_id: bill.id, relation: 'converted',
  })
  await supabase.from('documents').update({ status: 'converted' }).eq('id', id).eq('user_id', user.id)

  return NextResponse.json({ billId: bill.id })
}
