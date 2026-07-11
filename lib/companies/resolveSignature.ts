import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Resolve the public signature-image URL to print on a document (v89).
 * Priority: the explicitly chosen signatory → the company's default signatory.
 * Returns null when neither has a signature image. Images live in the PUBLIC
 * vaultr-avatars bucket.
 *
 * The explicit `signatoryId` is only honoured when it belongs to `companyId`
 * (when a company is given). This keeps salary slips per-employee-company: a
 * payroll run's chosen signatory applies only to slips of that same company;
 * employees of a different company fall back to THEIR company's default.
 */
export interface ResolvedSignature {
  url: string | null
  /** Fixed print size chosen on the signatory (ratio preserved). */
  size: { mode: 'width' | 'height'; mm: number } | null
}

/** Full resolution: the signature image AND its fixed print size. */
export async function resolveSignature(
  supabase: SupabaseClient,
  userId: string,
  opts: { signatoryId?: string | null; companyId?: string | null },
): Promise<ResolvedSignature> {
  const SEL = 'signature_path, company_id, sign_size_mode, sign_size_mm'
  let row: Record<string, unknown> | null = null

  if (opts.signatoryId) {
    const { data } = await supabase
      .from('company_signatories').select(SEL)
      .eq('id', opts.signatoryId).eq('user_id', userId).maybeSingle()
    // Only use the explicit signatory when it belongs to the target company.
    if (data && (!opts.companyId || data.company_id === opts.companyId)) row = data
  }

  if (!row?.signature_path && opts.companyId) {
    const { data } = await supabase
      .from('company_signatories').select(SEL)
      .eq('company_id', opts.companyId).eq('user_id', userId).eq('is_default', true).maybeSingle()
    if (data) row = data
  }

  const path = (row?.signature_path as string | null) ?? null
  if (!path) return { url: null, size: null }

  const url = supabase.storage.from('vaultr-avatars').getPublicUrl(path).data.publicUrl ?? null
  const mm = Number(row?.sign_size_mm ?? 0)
  const mode = (row?.sign_size_mode === 'height' ? 'height' : 'width') as 'width' | 'height'
  return { url, size: mm > 0 ? { mode, mm } : null }
}

/** Back-compat: just the URL. */
export async function resolveSignatureUrl(
  supabase: SupabaseClient,
  userId: string,
  opts: { signatoryId?: string | null; companyId?: string | null },
): Promise<string | null> {
  const { url } = await resolveSignature(supabase, userId, opts)
  return url
}
