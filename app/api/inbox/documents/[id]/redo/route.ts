import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// POST — reset email document to 'new' and delete its linked supplier invoice
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  // Fetch doc to get linked invoice id
  const { data: doc } = await supabase
    .from('email_documents')
    .select('id, user_id, supplier_invoice_id')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Delete the linked supplier invoice if it exists
  if (doc.supplier_invoice_id) {
    await supabase
      .from('supplier_invoices')
      .delete()
      .eq('id', doc.supplier_invoice_id)
      .eq('user_id', user.id)
  }

  // Reset the email document
  await supabase
    .from('email_documents')
    .update({
      status:              'new',
      supplier_invoice_id: null,
      processing_error:    null,
      extraction_confidence: null,
    })
    .eq('id', id)
    .eq('user_id', user.id)

  return NextResponse.json({ ok: true })
}
