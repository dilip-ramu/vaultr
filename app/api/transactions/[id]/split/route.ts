import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface SplitInput {
  type: 'expense' | 'income' | 'transfer'
  amount: number
  categoryId?: string | null
  toAccountId?: string | null
  name?: string | null
  notes?: string | null
}

const r2 = (n: number) => Math.round(n * 100) / 100

// POST /api/transactions/[id]/split
// Replaces one transaction with N parts (each a full transaction on the same
// account + date). Parts may mix expense / income / transfer. They all carry
// split_group_id = the original id, so the split is traceable.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: tx } = await supabase.from('transactions').select('*').eq('id', id).eq('user_id', user.id).maybeSingle()
  if (!tx) return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })

  let body: { splits?: SplitInput[] }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const splits = body.splits ?? []

  if (splits.length < 2) return NextResponse.json({ error: 'Add at least two parts to split into.' }, { status: 400 })

  // Validate each part.
  for (const s of splits) {
    const amt = r2(Number(s.amount))
    if (!Number.isFinite(amt) || amt <= 0) return NextResponse.json({ error: 'Every part needs an amount greater than zero.' }, { status: 400 })
    if (!['expense', 'income', 'transfer'].includes(s.type)) return NextResponse.json({ error: 'Invalid part type.' }, { status: 400 })
    if (s.type === 'transfer') {
      if (!s.toAccountId) return NextResponse.json({ error: 'Every transfer part needs a destination account.' }, { status: 400 })
      if (s.toAccountId === tx.account_id) return NextResponse.json({ error: 'A transfer part cannot target the same account.' }, { status: 400 })
    }
  }

  // The parts must add up to the original exactly.
  const total = r2(splits.reduce((s, x) => s + Number(x.amount), 0))
  const original = r2(Number(tx.amount))
  if (Math.abs(total - original) > 0.01) {
    return NextResponse.json({ error: `Parts add up to ${total}, but the transaction is ${original}.` }, { status: 400 })
  }

  const rows = splits.map(s => ({
    user_id: user.id,
    account_id: tx.account_id,
    to_account_id: s.type === 'transfer' ? s.toAccountId : null,
    category_id: s.type === 'transfer' ? null : (s.categoryId || null),
    type: s.type,
    amount: r2(Number(s.amount)),
    date: tx.date,
    name: s.name?.trim() || tx.name || null,
    notes: s.notes?.trim() || null,
    original_currency: tx.original_currency ?? 'INR',
    split_group_id: id,
  }))

  const { data: created, error: insErr } = await supabase.from('transactions').insert(rows).select('id')
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })

  // Remove the original — the parts fully replace it.
  const { error: delErr } = await supabase.from('transactions').delete().eq('id', id).eq('user_id', user.id)
  if (delErr) {
    // Roll back the parts so we never double-count.
    const ids = (created ?? []).map(c => c.id as string)
    if (ids.length) await supabase.from('transactions').delete().in('id', ids).eq('user_id', user.id)
    return NextResponse.json({ error: `Could not replace the original: ${delErr.message}` }, { status: 500 })
  }

  return NextResponse.json({ ok: true, count: rows.length })
}
