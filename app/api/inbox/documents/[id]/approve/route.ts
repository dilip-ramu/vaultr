import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  let body: {
    supplier_id: string
    invoice_number: string
    invoice_date: string
    due_date?: string | null
    amount: number
    currency: string
    gst_amount?: number | null
  }

  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.supplier_id)    return NextResponse.json({ error: 'supplier_id is required' }, { status: 400 })
  if (!body.invoice_number) return NextResponse.json({ error: 'invoice_number is required' }, { status: 400 })
  if (!body.invoice_date)   return NextResponse.json({ error: 'invoice_date is required' }, { status: 400 })
  if (!body.amount)         return NextResponse.json({ error: 'amount is required' }, { status: 400 })

  // Verify the email document belongs to this user
  const { data: doc } = await supabase
    .from('email_documents')
    .select('id, user_id, storage_path, attachment_name, renamed_filename, email_subject')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 })

  // Duplicate check
  const { data: existing } = await supabase
    .from('supplier_invoices')
    .select('id')
    .eq('user_id', user.id)
    .eq('supplier_id', body.supplier_id)
    .eq('invoice_number', body.invoice_number)
    .maybeSingle()

  if (existing) {
    return NextResponse.json(
      { error: `Invoice ${body.invoice_number} already exists for this supplier` },
      { status: 409 }
    )
  }

  // Get supplier name for the renamed filename
  const { data: supplier } = await supabase
    .from('suppliers')
    .select('name')
    .eq('id', body.supplier_id)
    .maybeSingle()

  const sanitize = (s: string) => s.replace(/[^a-zA-Z0-9._-]/g, '_')
  const renamedFilename = supplier
    ? `${sanitize(supplier.name)}_${sanitize(body.invoice_number)}_${body.amount}.pdf`
    : null

  // Create the supplier invoice
  const { data: invoice, error: insertError } = await supabase
    .from('supplier_invoices')
    .insert({
      user_id:                   user.id,
      supplier_id:               body.supplier_id,
      invoice_number:            body.invoice_number,
      invoice_date:              body.invoice_date,
      due_date:                  body.due_date || null,
      amount:                    body.amount,
      currency:                  body.currency ?? 'INR',
      notes:                     `Imported from email: ${doc.email_subject ?? ''}`,
      attachment_path:           doc.storage_path,
      attachment_name:           renamedFilename ?? doc.attachment_name,
      source_email_document_id:  id,
      auto_imported:             true,
      import_date:               new Date().toISOString(),
      extraction_confidence:     1.0,   // manually approved
      status:                    'pending',
      is_paid:                   false,
      is_recoverable:            true,
      recoverable_status:        'pending_billing',
    })
    .select('id')
    .single()

  if (insertError || !invoice) {
    return NextResponse.json(
      { error: insertError?.message ?? 'Failed to create invoice' },
      { status: 500 }
    )
  }

  // Mark email document as invoice_created
  await supabase
    .from('email_documents')
    .update({
      status:              'invoice_created',
      supplier_invoice_id: invoice.id,
      renamed_filename:    renamedFilename,
      processing_error:    null,
    })
    .eq('id', id)
    .eq('user_id', user.id)

  return NextResponse.json({ invoice_id: invoice.id })
}
