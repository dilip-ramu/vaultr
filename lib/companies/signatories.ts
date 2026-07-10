// Authorised signatory of a company (proprietor or a partner). Its signature
// image lives in the PUBLIC vaultr-avatars bucket at
// <user_id>/signatories/<id>.<ext>; resolve via getPublicUrl.

export interface CompanySignatory {
  id: string
  user_id: string
  company_id: string
  name: string
  designation: string | null
  signature_path: string | null
  is_default: boolean
  sort_order: number
  created_at?: string
  updated_at?: string
}

/** Signatory as seen by document creators (with a resolved public image URL). */
export interface SignatoryOption {
  id: string
  name: string
  designation: string | null
  is_default: boolean
  signatureUrl: string | null
}
