import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { planOrderDelete, type DeletePlan } from '@/lib/orders/deletePlan'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Deleting an order, and the preview of it.
 *
 * GET  → what would go, and what is in the way.
 * DELETE → does it, after working the same thing out again.
 *
 * The plan is recomputed here before anything is removed. The client has a
 * copy from the preview, but a preview taken two minutes ago is not evidence
 * that nobody has been paid since — and the whole point of the refusal is
 * that it holds.
 */

async function gather(supabase: SupabaseClient, uid: string, id: string) {
  const [{ data: order }, { data: documents }, { data: invoices }, { data: bills }, { data: transactions }, { data: files }] =
    await Promise.all([
      supabase.from('orders').select('id, number').eq('id', id).eq('user_id', uid).maybeSingle(),
      supabase.from('documents').select('id, doc_type, number').eq('user_id', uid).eq('order_id', id),
      supabase.from('recoverable_invoices').select('id, invoice_number, paid_amount, status').eq('user_id', uid).eq('order_id', id),
      supabase.from('supplier_invoices').select('id, invoice_number, is_paid').eq('user_id', uid).eq('order_id', id),
      supabase.from('transactions').select('id, amount, date').eq('user_id', uid).eq('order_id', id),
      supabase.from('order_files').select('id, path').eq('user_id', uid).eq('order_id', id),
    ])

  if (!order) return null
  const plan = planOrderDelete({
    documents: documents ?? [],
    invoices: invoices ?? [],
    bills: bills ?? [],
    transactions: transactions ?? [],
    fileCount: (files ?? []).length,
  })
  return { order, plan, files: (files ?? []) as { id: string; path: string }[] }
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const found = await gather(supabase, user.id, id)
  if (!found) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ plan: found.plan as DeletePlan, number: found.order.number })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const found = await gather(supabase, user.id, id)
  if (!found) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { plan, files } = found
  if (!plan.canDelete) {
    // 409, not 400: nothing about the request is wrong, the order is simply
    // not in a state where this can happen.
    return NextResponse.json({ error: 'Something on this order has been paid', plan }, { status: 409 })
  }

  const docIds = plan.documents.map(d => d.id)
  if (docIds.length) {
    // The chain links first. document_links points at documents by id with no
    // foreign key behind it, so deleting the documents alone would leave rows
    // referring to things that no longer exist, and the chain view on another
    // document would render gaps.
    await supabase.from('document_links').delete().eq('user_id', user.id)
      .eq('source_kind', 'document').in('source_id', docIds)
    await supabase.from('document_links').delete().eq('user_id', user.id)
      .eq('target_kind', 'document').in('target_id', docIds)
    // document_lines cascade from documents.
    const { error } = await supabase.from('documents').delete().eq('user_id', user.id).in('id', docIds)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // The uploaded files themselves, before the rows that point at them — a row
  // deleted first would leave the object in the bucket with nothing naming it.
  const paths = files.map(f => f.path).filter(Boolean)
  if (paths.length) await supabase.storage.from('vaultr-attachments').remove(paths)

  // order_lines, order_line_sizes, order_costs and order_files all cascade.
  // Invoices, bills and transactions have ON DELETE SET NULL, so they survive
  // and simply stop pointing at an order that is gone.
  const { error } = await supabase.from('orders').delete().eq('id', id).eq('user_id', user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, deleted: { documents: docIds.length, files: paths.length } })
}
