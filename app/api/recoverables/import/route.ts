import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { parseCSVText, getSupplierColumns } from '@/lib/recoverables/csv/parser'
import { validateRows } from '@/lib/recoverables/csv/validator'
import { transformToShipments, summarize } from '@/lib/recoverables/csv/transformer'
import type { ParsedShipment } from '@/lib/recoverables/types'

export async function POST(req: NextRequest) {
  // 1. Auth check — use the cookie-based client throughout.
  // RLS policies allow authenticated users to insert/update/delete their own rows,
  // so we don't need the admin/service-role client for DB operations.
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // 2. Parse FormData
  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const file       = formData.get('file') as File | null
  const name       = (formData.get('name') as string | null)?.trim() || 'Untitled Import'
  const source     = (formData.get('source') as string | null)?.trim() || null
  const currency   = (formData.get('currency') as string | null)?.trim() || 'INR'
  const importDate = (formData.get('importDate') as string | null)?.trim() || new Date().toISOString().slice(0, 10)
  const isPreview  = formData.get('preview') === 'true'

  if (!file || file.size === 0) {
    return NextResponse.json({ error: 'No CSV file provided' }, { status: 400 })
  }

  // 3. Parse CSV
  const csvText = await file.text()
  const supplierColumns = getSupplierColumns(csvText)
  const rows = parseCSVText(csvText)

  // 4. Validate
  const { validRows, errors, isValid } = validateRows(rows, supplierColumns)

  // 5. Preview mode or invalid: return without writing
  if (isPreview || !isValid) {
    const shipments = isValid ? transformToShipments(validRows, currency) : []
    const summary   = isValid ? summarize(shipments) : null

    return NextResponse.json({
      preview: true,
      isValid,
      errors,
      rows: validRows.slice(0, 50),
      supplierColumns,
      summary,
    })
  }

  // 6. Full import — all DB writes use the authenticated user's session (supabase).
  let batchId: string | null = null

  try {
    // a. Transform
    const shipments = transformToShipments(validRows, currency)
    const summary   = summarize(shipments)

    // b. Upload CSV to Storage (best-effort — don't fail the import if storage fails)
    let storagePath: string | null = null
    try {
      storagePath = `recoverables/imports/${user.id}/${Date.now()}-${name}.csv`
      const { error: storageErr } = await supabase.storage
        .from('vaultr-attachments')
        .upload(storagePath, new Blob([csvText], { type: 'text/csv' }), {
          contentType: 'text/csv',
          upsert: false,
        })
      if (storageErr) storagePath = null
    } catch {
      storagePath = null
    }

    // c. Insert batch (status='pending')
    const { data: batchRow, error: batchErr } = await supabase
      .from('recoverable_import_batches')
      .insert({
        user_id:    user.id,
        name,
        source,
        import_date: importDate,
        currency,
        csv_path:   storagePath,
        status:     'pending',
      })
      .select('id')
      .single()

    if (batchErr || !batchRow) throw new Error(`Failed to create batch: ${batchErr?.message}`)
    batchId = batchRow.id

    // d. Batch insert shipments in chunks of 100
    const shipmentRows = shipments.map(s => ({
      user_id:        user.id,
      batch_id:       batchId,
      reference:      s.reference,
      total_cost:     s.totalCost,
      total_pieces:   s.totalPieces,
      per_piece_cost: s.perPieceCost,
      shipment_date:  s.shipmentDate ?? null,
    }))

    const shipmentIdMap = new Map<string, string>()

    for (let i = 0; i < shipmentRows.length; i += 100) {
      const chunk = shipmentRows.slice(i, i + 100)
      const { data: inserted, error: shipErr } = await supabase
        .from('recoverable_shipments')
        .insert(chunk)
        .select('id, reference')

      if (shipErr) throw new Error(`Shipment insert failed: ${shipErr.message}`)
      for (const row of inserted ?? []) {
        shipmentIdMap.set(row.reference, row.id)
      }
    }

    // e. Batch insert allocations in chunks of 200
    const allocationRows = buildAllocationRows(shipments, shipmentIdMap, batchId!, user.id)

    for (let i = 0; i < allocationRows.length; i += 200) {
      const chunk = allocationRows.slice(i, i + 200)
      const { error: allocErr } = await supabase
        .from('recoverable_allocations')
        .insert(chunk)

      if (allocErr) throw new Error(`Allocation insert failed: ${allocErr.message}`)
    }

    // f. Update batch with final summary
    await supabase
      .from('recoverable_import_batches')
      .update({
        status:            'processed',
        row_count:         validRows.length,
        reference_count:   summary.referenceCount,
        supplier_count:    summary.supplierCount,
        total_cost:        summary.totalCost,
        total_recoverable: summary.totalRecoverable,
      })
      .eq('id', batchId)

    return NextResponse.json({ success: true, batchId, summary })

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)

    // Mark batch as failed if it was created
    if (batchId) {
      await supabase
        .from('recoverable_import_batches')
        .update({ status: 'failed', validation_errors: { error: msg } })
        .eq('id', batchId)
    }

    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// ── Helpers ─────────────────────────────────────────────────

function buildAllocationRows(
  shipments: ParsedShipment[],
  shipmentIdMap: Map<string, string>,
  batchId: string,
  userId: string,
) {
  const rows = []
  for (const s of shipments) {
    const shipmentId = shipmentIdMap.get(s.reference)
    if (!shipmentId) continue

    for (const a of s.allocations) {
      rows.push({
        user_id:            userId,
        batch_id:           batchId,
        shipment_id:        shipmentId,
        supplier_name:      a.supplierName,
        pieces:             a.pieces,
        base_cost:          a.baseCost,
        markup_type:        a.markupType,
        markup_value:       a.markupValue,
        markup_amount:      a.markupAmount,
        recoverable_amount: a.recoverableAmount,
        status:             'pending',
      })
    }
  }
  return rows
}
