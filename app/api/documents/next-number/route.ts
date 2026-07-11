import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET /api/documents/next-number?company=<id>&code=PO&prefix=C
// Peeks the next document number WITHOUT consuming it, so the create form shows
// the real next number. The authoritative value is still reserved on save via
// next_document_number(); this uses the same rule (counter high-water mark, or
// the max existing number, whichever is higher).
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sp = req.nextUrl.searchParams
  const company = sp.get('company')
  const code = sp.get('code')
  const prefix = sp.get('prefix') ?? ''
  if (!company || !code) return NextResponse.json({ error: 'company and code required' }, { status: 400 })

  const yy = String(new Date().getFullYear()).slice(-2)
  const p = prefix.trim().replace(/[-\s]+$/, '').toUpperCase() || 'DOC'
  const head = `${p}-${code}${yy}`

  // High-water mark from the counter (may not exist yet).
  let counterSeq = 0
  const { data: counter } = await supabase.from('document_counters')
    .select('last_seq').eq('user_id', user.id).eq('company_id', company)
    .eq('code', code).eq('yy', yy).maybeSingle()
  if (counter?.last_seq) counterSeq = Number(counter.last_seq) || 0

  // Highest number already used for this company + head.
  let existingMax = 0
  const { data: docs } = await supabase.from('documents')
    .select('number').eq('user_id', user.id).eq('company_id', company).like('number', `${head}%`)
  for (const d of docs ?? []) {
    const n = parseInt(String(d.number).slice(head.length), 10)
    if (Number.isFinite(n) && n > existingMax) existingMax = n
  }

  const next = Math.max(counterSeq, existingMax) + 1
  return NextResponse.json({ number: `${head}${String(next).padStart(4, '0')}` })
}
