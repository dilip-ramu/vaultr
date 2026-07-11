// GST state codes. The first two digits of a GSTIN ARE the state code, which is
// what determines whether a supply is intra-state (CGST + SGST) or inter-state
// (IGST) — so most of the time we never have to ask the user for a state at all.

export const GST_STATES: Record<string, string> = {
  '01': 'Jammu and Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh',
  '05': 'Uttarakhand', '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh',
  '10': 'Bihar', '11': 'Sikkim', '12': 'Arunachal Pradesh', '13': 'Nagaland', '14': 'Manipur',
  '15': 'Mizoram', '16': 'Tripura', '17': 'Meghalaya', '18': 'Assam', '19': 'West Bengal',
  '20': 'Jharkhand', '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh',
  '24': 'Gujarat', '26': 'Dadra and Nagar Haveli and Daman and Diu', '27': 'Maharashtra',
  '29': 'Karnataka', '30': 'Goa', '31': 'Lakshadweep', '32': 'Kerala', '33': 'Tamil Nadu',
  '34': 'Puducherry', '35': 'Andaman and Nicobar Islands', '36': 'Telangana',
  '37': 'Andhra Pradesh', '38': 'Ladakh', '96': 'Other Country', '97': 'Other Territory',
}

/** The state code embedded in a GSTIN, or null if it isn't one. */
export function stateCodeFromGstin(gstin: string | null | undefined): string | null {
  const g = (gstin ?? '').trim().toUpperCase()
  if (g.length < 2) return null
  const code = g.slice(0, 2)
  return GST_STATES[code] ? code : null
}

/** A GSTIN is 15 chars: 2 state + 10 PAN + 1 entity + 'Z' + 1 checksum. */
export function isValidGstin(gstin: string | null | undefined): boolean {
  const g = (gstin ?? '').trim().toUpperCase()
  return /^[0-3][0-9][A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/.test(g) && !!GST_STATES[g.slice(0, 2)]
}

/** Match a free-text state ("Tamil Nadu", "tamilnadu") to its code. */
export function stateCodeFromName(name: string | null | undefined): string | null {
  const n = (name ?? '').trim().toLowerCase().replace(/[^a-z]/g, '')
  if (!n) return null
  for (const [code, label] of Object.entries(GST_STATES)) {
    if (label.toLowerCase().replace(/[^a-z]/g, '') === n) return code
  }
  return null
}

export const stateName = (code: string | null): string => (code && GST_STATES[code]) || 'Unknown'

/** "33 - Tamil Nadu", the format the GST portal expects for place of supply. */
export const placeOfSupply = (code: string | null): string => (code ? `${code}-${stateName(code)}` : '')
