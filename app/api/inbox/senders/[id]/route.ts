import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// PATCH — update sender (email, name, is_active)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  let body: {
    email?: string
    name?: string
    is_active?: boolean
    is_document?: boolean
    is_bank_alert?: boolean
    default_account_id?: string | null
  }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const updates: Record<string, unknown> = {}
  if (body.email !== undefined) updates.email = body.email.trim().toLowerCase()
  if (body.name !== undefined) updates.name = body.name?.trim() || null
  if (body.is_active !== undefined) updates.is_active = body.is_active
  if (body.is_document !== undefined) updates.is_document = body.is_document
  if (body.is_bank_alert !== undefined) updates.is_bank_alert = body.is_bank_alert
  if (body.default_account_id !== undefined) updates.default_account_id = body.default_account_id

  // Keep the legacy `kind` column in sync so older code paths still see the
  // sender in their expected inbox. document wins as the canonical default;
  // bank_alert is used only when document is off.
  if (body.is_document !== undefined || body.is_bank_alert !== undefined) {
    const isDoc   = body.is_document   ?? false
    const isAlert = body.is_bank_alert ?? false
    if (isDoc)        updates.kind = 'document'
    else if (isAlert) updates.kind = 'bank_alert'
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('monitored_senders')
    .update(updates)
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ sender: data })
}

// DELETE — remove sender
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const { error } = await supabase
    .from('monitored_senders')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
