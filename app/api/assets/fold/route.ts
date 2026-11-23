// Folding a finished construction onto the asset it became.
//
// Two writes: the improvement lands on the target asset, and the fold is
// recorded so those bills leave the bucket. The fold row is written FIRST and
// removed again if the asset write fails — the opposite order would leave the
// money counted twice, once on the target and once still in the bucket, which
// is the worse of the two failures.
//
// The amount is never taken from the request. It is recomputed here from the
// bills, so a stale screen or a tampered payload cannot fold a figure that was
// never spent.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { bucket, foldBucket, foldProblem, type Fold, type SpendTxn, type FoldKind } from '@/lib/assets/construction'
import type { Improvement } from '@/lib/assets/improvements'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: {
    sourceAssetId?: string
    targetAssetId?: string
    improvementName?: string
    completedOn?: string
    kind?: FoldKind
    ratePct?: number | null
  }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const sourceAssetId = String(body.sourceAssetId ?? '')
  const targetAssetId = String(body.targetAssetId ?? '')
  if (!sourceAssetId || !targetAssetId) {
    return NextResponse.json({ error: 'Both assets are needed' }, { status: 400 })
  }

  // ── Rebuild the bucket from the bills ─────────────────────────────────────
  const { data: cats } = await supabase.from('categories')
    .select('id').eq('user_id', user.id).eq('asset_id', sourceAssetId)
  const catIds = (cats ?? []).map(c => String(c.id))
  if (catIds.length === 0) {
    return NextResponse.json({ error: 'No category funds that asset, so it has no bucket to fold.' }, { status: 400 })
  }

  const [{ data: spend }, { data: folds }] = await Promise.all([
    supabase.from('transactions').select('id, name, amount, date')
      .eq('user_id', user.id).in('category_id', catIds),
    supabase.from('asset_folds').select('transaction_ids')
      .eq('user_id', user.id).eq('source_asset_id', sourceAssetId),
  ])

  const live = bucket(
    ((spend ?? []) as { id: string; name: string | null; amount: number; date: string }[])
      .map(t => ({ id: String(t.id), amount: Number(t.amount) || 0, date: String(t.date).slice(0, 10), name: t.name } as SpendTxn)),
    ((folds ?? []) as { transaction_ids: string[] | null }[])
      .map(f => ({ id: '', targetAssetId: '', improvementName: '', completedOn: '', amount: 0, transactionIds: (f.transaction_ids ?? []).map(String) } as Fold)),
  )

  const request = {
    sourceAssetId,
    targetAssetId,
    improvementName: String(body.improvementName ?? ''),
    completedOn: String(body.completedOn ?? ''),
    kind: (body.kind ?? 'flat') as FoldKind,
    ratePct: body.ratePct ?? null,
  }
  const problem = foldProblem(live, request)
  if (problem) return NextResponse.json({ error: problem }, { status: 400 })

  const { improvement, fold } = foldBucket(live, request)

  // The target asset must be the user's own, and its improvements live inside
  // details — read it before writing so nothing else in there is lost.
  const { data: target } = await supabase.from('assets')
    .select('id, name, details').eq('id', targetAssetId).eq('user_id', user.id).maybeSingle()
  if (!target) return NextResponse.json({ error: 'That asset was not found' }, { status: 404 })

  const { data: foldRow, error: foldErr } = await supabase.from('asset_folds').insert({
    user_id: user.id,
    source_asset_id: sourceAssetId,
    target_asset_id: targetAssetId,
    improvement_name: fold.improvementName,
    completed_on: fold.completedOn,
    amount: fold.amount,
    transaction_ids: fold.transactionIds,
    note: improvement.note,
  }).select('id').single()
  if (foldErr) return NextResponse.json({ error: foldErr.message }, { status: 500 })

  const details = (target.details ?? {}) as Record<string, unknown>
  const existing = (details.improvements as Improvement[] | undefined) ?? []
  const next = [...existing, { id: String(foldRow.id), ...improvement } as Improvement]

  const { error: assetErr } = await supabase.from('assets')
    .update({ details: { ...details, improvements: next } })
    .eq('id', targetAssetId).eq('user_id', user.id)

  if (assetErr) {
    // Put the bucket back rather than leave the money in both places.
    await supabase.from('asset_folds').delete().eq('id', foldRow.id).eq('user_id', user.id)
    return NextResponse.json({ error: assetErr.message }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    folded: fold.amount,
    bills: fold.transactionIds.length,
    into: target.name,
  })
}
