import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { parseStatement, applyCutoff } from '@/lib/statements/parse'

// POST — import past-statement transactions into an account.
// Body (multipart/form-data):
//   file:    CSV file
//   cutoff:  YYYY-MM-DD — drop rows on or after this date (so newer ones the
//            user has already entered manually don't double up). Optional.
//   preview: 'true' → return parsed rows without writing.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: accountId } = await params

  // Make sure the account is the caller's
  const { data: account } = await supabase
    .from('accounts')
    .select('id, name')
    .eq('id', accountId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!account) return NextResponse.json({ error: 'Account not found' }, { status: 404 })

  let form: FormData
  try { form = await req.formData() } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const file    = form.get('file') as File | null
  const cutoff  = (form.get('cutoff')  as string | null)?.trim() || null
  const preview = form.get('preview') === 'true'

  if (!file || file.size === 0) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })

  const text = await file.text()
  const parsed = parseStatement(text)
  if (parsed.rows.length === 0) {
    return NextResponse.json({
      error: parsed.warnings[0] ?? 'No usable rows found in the file.',
      headers: parsed.headers,
    }, { status: 400 })
  }

  const { kept, skipped } = applyCutoff(parsed.rows, cutoff)

  if (preview) {
    return NextResponse.json({
      preview: true,
      total: parsed.rows.length,
      keptCount: kept.length,
      skipped,
      sample: kept.slice(0, 50),
      warnings: parsed.warnings.slice(0, 20),
      cutoff,
    })
  }

  if (kept.length === 0) {
    return NextResponse.json({ error: 'Nothing to import — every row was on or after the cutoff date.' }, { status: 400 })
  }

  // Build rows for the transactions table — keep it minimal: type, amount,
  // date, name, account_id. No category/payee — user can bulk-tag later.
  const inserts = kept.map(r => ({
    user_id: user.id,
    account_id: accountId,
    type: r.type,
    amount: r.amount,
    original_amount: r.amount,
    original_currency: 'INR',
    date: r.date,
    name: r.description.slice(0, 200),
  }))

  // Chunk to avoid huge single requests (Postgres params limit).
  const CHUNK = 500
  let inserted = 0
  for (let i = 0; i < inserts.length; i += CHUNK) {
    const slice = inserts.slice(i, i + CHUNK)
    const { error, count } = await supabase
      .from('transactions')
      .insert(slice, { count: 'exact' })
    if (error) {
      return NextResponse.json({
        error: error.message,
        inserted,
        totalAttempted: inserts.length,
      }, { status: 500 })
    }
    inserted += count ?? slice.length
  }

  return NextResponse.json({
    success: true,
    inserted,
    skipped,
    accountName: account.name,
  })
}
