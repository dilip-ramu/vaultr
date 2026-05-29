import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { encryptPassword } from '@/lib/email/crypto'

// GET — fetch current integration (without password fields)
export async function GET(_req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('email_integrations')
    .select('id, provider, email_address, is_active, last_checked_at, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ integration: data ?? null })
}

// POST — create or update integration (upsert by email_address)
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { email_address: string; app_password: string; provider?: string }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { email_address, app_password, provider = 'yahoo' } = body
  if (!email_address || !app_password) {
    return NextResponse.json({ error: 'email_address and app_password are required' }, { status: 400 })
  }

  let encrypted: string
  let iv: string
  try {
    const result = encryptPassword(app_password)
    encrypted = result.encrypted
    iv = result.iv
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }

  // Check if integration already exists for this user
  const { data: existing } = await supabase
    .from('email_integrations')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle()

  let data, error
  if (existing) {
    // Update existing integration
    ;({ data, error } = await supabase
      .from('email_integrations')
      .update({
        provider,
        email_address,
        encrypted_password: encrypted,
        encryption_iv: iv,
        is_active: true,
      })
      .eq('id', existing.id)
      .eq('user_id', user.id)
      .select('id, provider, email_address, is_active, last_checked_at, created_at')
      .single())
  } else {
    // Insert new integration
    ;({ data, error } = await supabase
      .from('email_integrations')
      .insert({
        user_id: user.id,
        provider,
        email_address,
        encrypted_password: encrypted,
        encryption_iv: iv,
        is_active: true,
      })
      .select('id, provider, email_address, is_active, last_checked_at, created_at')
      .single())
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ integration: data }, { status: existing ? 200 : 201 })
}

// DELETE — remove integration
export async function DELETE(_req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { error } = await supabase
    .from('email_integrations')
    .delete()
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
