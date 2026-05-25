/**
 * Normalizer: converts OCR-parsed intermediate types into Vaultr DB schema shapes.
 * This is the bridge between ParsedCourierInvoice and the CourierInvoice / AWB tables.
 */

import type { CourierInvoice, AWB, CourierProvider } from '@/lib/logistics/types'
import type { ParsedAWB, ParsedAWBCharge, ParsedCourierInvoice } from './types'

// ── Provider mapping ───────────────────────────────────────

const PROVIDER_MAP: Record<string, CourierProvider> = {
  dhl:    'DHL',
  fedex:  'FedEx',
  aramex: 'Aramex',
  ups:    'UPS',
}

/**
 * Maps a free-text provider string to the CourierProvider enum.
 * Falls back to 'custom' for unknown providers.
 */
export function mapProviderToEnum(provider: string): CourierProvider {
  const key = provider.toLowerCase().trim()
  return PROVIDER_MAP[key] ?? 'custom'
}

// ── Invoice normalizer ─────────────────────────────────────

/**
 * Converts a ParsedCourierInvoice into a Partial<CourierInvoice> ready for DB insert/update.
 * Caller is responsible for supplying user_id, id, etc.
 *
 * TODO: add currency validation once multi-currency support is widened.
 */
export function normalizeInvoice(parsed: ParsedCourierInvoice): Partial<CourierInvoice> {
  return {
    courier_provider: mapProviderToEnum(parsed.provider),
    invoice_number:   parsed.invoiceNumber ?? '',
    invoice_date:     parsed.invoiceDate ?? new Date().toISOString().split('T')[0],
    currency:         parsed.currency ?? 'INR',
    total_amount:     parsed.totalAmount ?? 0,
    tax_amount:       parsed.taxAmount ?? 0,
    subtotal:         parsed.totalAmount != null && parsed.taxAmount != null
                        ? parsed.totalAmount - parsed.taxAmount
                        : (parsed.totalAmount ?? 0),
    ocr_confidence:   parsed.confidence,
    ocr_raw_data:     { rawData: parsed.rawData, parseMethod: parsed.parseMethod } as Record<string, unknown>,
    ocr_status:       'done',
  }
}

// ── AWB normalizer ─────────────────────────────────────────

/**
 * Converts the AWBs in a ParsedCourierInvoice into Partial<AWB>[] ready for batch insert.
 * Charge fields are mapped by label to the corresponding AWB column.
 *
 * TODO: map additional charge labels as more courier formats are added.
 */
export function normalizeAWBs(
  parsed: ParsedCourierInvoice,
  courierInvoiceId: string,
): Partial<AWB>[] {
  return parsed.awbs.map(awb => {
    const charges = buildChargeMap(awb.charges)

    return {
      courier_invoice_id:  courierInvoiceId,
      awb_number:          awb.awbNumber,
      shipment_date:       awb.shipmentDate ?? null,
      receiver_name:       awb.receiverName ?? null,
      destination_country: awb.destinationCountry ?? null,
      destination_city:    awb.destinationCity ?? null,
      actual_weight:       awb.actualWeight ?? null,
      volumetric_weight:   awb.volumetricWeight ?? null,
      chargeable_weight:   awb.chargeableWeight ?? null,
      weight_unit:         'KG',
      shipment_charge:     charges.shipment_charge ?? 0,
      fuel_surcharge:      charges.fuel_surcharge ?? 0,
      demand_surcharge:    charges.demand_surcharge ?? 0,
      gogreen_surcharge:   charges.gogreen_surcharge ?? 0,
      remote_area_charge:  charges.remote_area_charge ?? 0,
      other_charges:       charges.other_charges ?? 0,
      tax_amount:          charges.tax_amount ?? 0,
      total_pieces:        0,  // must be set manually after OCR
      allocated_pieces:    0,
      // Preserve raw OCR output for debugging and re-parsing
      raw_line_data: {
        ocrRawText:   awb.rawText,
        ocrCharges:   awb.charges,
        ocrConfidence: awb.confidence,
      } as Record<string, unknown>,
    }
  })
}

// ── Helpers ────────────────────────────────────────────────

/**
 * Folds extracted charge labels into a flat map of { fieldName: amount }.
 * Known field keys match AWB column names directly.
 * Unknown labels are summed into 'other_charges'.
 */
function buildChargeMap(charges: ParsedAWBCharge[]): Record<string, number> {
  const known = new Set([
    'shipment_charge', 'fuel_surcharge', 'demand_surcharge',
    'gogreen_surcharge', 'remote_area_charge', 'other_charges', 'tax_amount',
  ])

  const result: Record<string, number> = {}

  for (const charge of charges) {
    if (known.has(charge.label)) {
      result[charge.label] = (result[charge.label] ?? 0) + charge.amount
    } else {
      result['other_charges'] = (result['other_charges'] ?? 0) + charge.amount
    }
  }

  return result
}
