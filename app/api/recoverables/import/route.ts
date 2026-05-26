import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { parseCSVText, getSupplierColumns } from '@/lib/recoverables/csv/parser'
import { validateRows } from '@/lib/recoverables/csv/validator'
import { transformToShipments, summarize } from '@/lib/recoverables/csv/transformer'
import type { ParsedShipment } from '@/lib/recoverables/types'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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

  const csvText = await file.text()
  const supplierColumns = getSupplierColumns(csvText)
  const rows = parseCSVText(csvText)

  const { validRows, errors, isValid } = validateRows(rows, supplierColumns)

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

  let batchId: string | null = null

  try {
    const shipments = transformToShipments(validRows, currency)
    const summary   = summarize(shipments)

    // Build csv_alias → customer_id map for auto-linking allocations.
    // Match is normalized (lowercase, no punctuation/spaces) so
    // "SURIYAA KNITWEAR" matches "Suriyaa Knitwear", "netto aps & co." matches "NETTO APS CO" etc.
    const aliasToCustomerId = new Map<string, string>()  // original CSV col → customer id
    const unmatchedCustomers: string[] = []
    if (supplierColumns.length > 0) {
      const { data: allCustomers } = await supabase
        .from('customers')
        .select('id, name, csv_alias')
        .eq('user_id', user.id)

      // Build a map of normalised alias/name → customer id
      const normToCustomerId = new Map<string, string>()
      for (const c of allCustomers ?? []) {
        if (c.csv_alias) normToCustomerId.set(normalise(c.csv_alias), c.id)
        // Also fall back to matching on the customer's actual name
        normToCustomerId.set(normalise(c.name), c.id)
      }

      for (const col of supplierColumns) {
        const customerId = normToCustomerId.get(normalise(col))
        if (customerId) {
          aliasToCustomerId.set(col, customerId)
        } else {
          unmatchedCustomers.push(col)
        }
      }
    }

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

    const shipmentRows = shipments.map(s => ({
      user_id:        user.id,
      batch_id:       batchId,
      reference:      s.reference,
      total_cost:     s.totalCost,
      total_pieces:   s.totalPieces,
      per_piece_cost: s.perPieceCost,
      shipment_date:  s.shipmentDate ?? null,
      client_name:    s.clientName ?? null,
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

    const allocationRows = buildAllocationRows(shipments, shipmentIdMap, batchId!, user.id, aliasToCustomerId)

    for (let i = 0; i < allocationRows.length; i += 200) {
      const chunk = allocationRows.slice(i, i + 200)
      const { error: allocErr } = await supabase
        .from('recoverable_allocations')
        .insert(chunk)

      if (allocErr) throw new Error(`Allocation insert failed: ${allocErr.message}`)
    }

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

    return NextResponse.json({ success: true, batchId, summary, unmatchedCustomers })

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)

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

// Strip punctuation, collapse whitespace, lowercase.
// "SURIYAA KNITWEAR" → "suriyaa knitwear"
// "Netto APS & Co. KG" → "netto aps co kg"
function normalise(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function buildAllocationRows(
  shipments: ParsedShipment[],
  shipmentIdMap: Map<string, string>,
  batchId: string,
  userId: string,
  aliasToCustomerId: Map<string, string>,
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
        customer_id:        aliasToCustomerId.get(a.supplierName) ?? null,
        customer_name:      a.supplierName,
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
