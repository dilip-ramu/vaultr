import { NextResponse } from 'next/server'
import { buildDocumentModel } from '@/lib/documents/buildModel'
import { createClient } from '@/lib/supabase/server'

// The DocModel for one issued document, as JSON.
//
// The supplier pack is zipped in the BROWSER, not here: rendering a PDF in
// Node works, but the letterhead logo does not — jsPDF loads it through an
// Image element, which only exists in a browser, and a purchase order that
// reaches the supplier without the letterhead looks like a draft. So the
// server hands over the model and the browser draws it, exactly as the print
// page does.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const built = await buildDocumentModel(supabase, user.id, id)
  if (!built) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(built)
}
