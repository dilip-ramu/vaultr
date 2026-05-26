import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { AllocationStatus } from '@/lib/recoverables/types'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as { status: AllocationStatus; notes?: string }
  const { status, notes } = body

  const validStatuses: AllocationStatus[] = ['pending', 'billed', 'paid', 'cancelled']
  if (!validStatuses.includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  // Verify ownership
  const { data: existing } = await supabase
    .from('recoverable_allocations')
    .select('id, user_id')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const patch: Record<string, unknown> = { status }
  if (notes !== undefined)     patch.notes     = notes
  if (status === 'billed')     patch.billed_at = new Date().toISOString()

  const { data: updated, error } = await supabase
    .from('recoverable_allocations')
    .update(patch)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(updated)
}
