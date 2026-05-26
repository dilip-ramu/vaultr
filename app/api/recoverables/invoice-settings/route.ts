import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// ── GET /api/recoverables/invoice-settings ────────────────────────────────

export async function GET(_req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Ensure a settings row exists with defaults
  await supabase
    .from('recoverable_invoice_settings')
    .upsert({ user_id: user.id }, { onConflict: 'user_id', ignoreDuplicates: true })

  const { data: settings, error } = await supabase
    .from('recoverable_invoice_settings')
    .select('*')
    .eq('user_id', user.id)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ settings })
}

// ── PUT /api/recoverables/invoice-settings ────────────────────────────────

export async function PUT(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: Record<string, unknown>
  try {
    body = await req.json() as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Strip any attempt to override user_id
  const { user_id: _removed, ...safeBody } = body as { user_id?: unknown } & Record<string, unknown>

  const { data: settings, error } = await supabase
    .from('recoverable_invoice_settings')
    .upsert(
      { ...safeBody, user_id: user.id, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    )
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ settings })
}
