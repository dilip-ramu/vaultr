import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET — list all monitored senders for user
export async function GET(_req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('monitored_senders')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ senders: data ?? [] })
}

// POST — add new sender. Caller can mark it as a supplier (is_document),
// transaction (is_bank_alert), or both. Defaults to supplier for backward
// compat with the old single-purpose inbox UI.
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: {
    email: string
    name?: string
    is_document?: boolean
    is_bank_alert?: boolean
    default_account_id?: string | null
  }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { email, name } = body
  if (!email) return NextResponse.json({ error: 'email is required' }, { status: 400 })

  const isDoc   = body.is_document   ?? true
  const isAlert = body.is_bank_alert ?? false
  const normalizedEmail = email.trim().toLowerCase()

  const { data, error } = await supabase
    .from('monitored_senders')
    .insert({
      user_id: user.id,
      email: normalizedEmail,
      name: name?.trim() || null,
      is_active: true,
      is_document: isDoc,
      is_bank_alert: isAlert,
      // Keep legacy `kind` in sync for old readers.
      kind: isDoc ? 'document' : 'bank_alert',
      default_account_id: body.default_account_id ?? null,
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'This sender is already being monitored' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ sender: data }, { status: 201 })
}
