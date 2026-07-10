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
export async function resolveSignatureUrl(
  supabase: SupabaseClient,
  userId: string,
  opts: { signatoryId?: string | null; companyId?: string | null },
): Promise<string | null> {
  let path: string | null = null

  if (opts.signatoryId) {
    const { data } = await supabase
      .from('company_signatories')
      .select('signature_path, company_id')
      .eq('id', opts.signatoryId).eq('user_id', userId).maybeSingle()
    // Only use the explicit signatory when it belongs to the target company
    // (or when no company constraint is supplied).
    if (data && (!opts.companyId || data.company_id === opts.companyId)) {
      path = (data.signature_path as string | null) ?? null
    }
  }

  if (!path && opts.companyId) {
    const { data } = await supabase
      .from('company_signatories')
      .select('signature_path')
      .eq('company_id', opts.companyId).eq('user_id', userId).eq('is_default', true).maybeSingle()
    path = (data?.signature_path as string | null) ?? null
  }

  if (!path) return null
  return supabase.storage.from('vaultr-avatars').getPublicUrl(path).data.publicUrl ?? null
}
