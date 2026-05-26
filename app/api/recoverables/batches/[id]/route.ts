import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Verify ownership first, then delete — RLS also enforces user_id match.
  // ON DELETE CASCADE in the schema handles shipments + allocations automatically.
  const { data: batch } = await supabase
    .from('recoverable_import_batches')
    .select('id')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!batch) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { error } = await supabase
    .from('recoverable_import_batches')
    .delete()
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
