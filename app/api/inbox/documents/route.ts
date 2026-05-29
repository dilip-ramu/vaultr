import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET — list email documents, supports ?status=&search=&sender=
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const status = searchParams.get('status')
  const search = searchParams.get('search')?.trim()
  const sender = searchParams.get('sender')?.trim()

  let query = supabase
    .from('email_documents')
    .select('*')
    .eq('user_id', user.id)
    .order('received_at', { ascending: false })

  if (status && status !== 'all') {
    query = query.eq('status', status)
  }

  if (sender) {
    query = query.eq('sender_email', sender.toLowerCase())
  }

  if (search) {
    query = query.or(
      `email_subject.ilike.%${search}%,sender_email.ilike.%${search}%,sender_name.ilike.%${search}%,attachment_name.ilike.%${search}%`
    )
  }

  const { data, error } = await query.limit(500)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ documents: data ?? [] })
}
