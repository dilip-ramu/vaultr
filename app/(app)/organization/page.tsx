import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import CompaniesClient from '@/components/company-details/CompaniesClient'
import type { Company } from '@/components/company-details/CompanyForm'

export const dynamic = 'force-dynamic'

/** Organization → Companies tab. Content moved out of /setup (Company was
 *  a tab there; now it belongs with Employees under Organization). */
export default async function OrganizationCompaniesTab() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: companies }, { data: mirroredCustomers }] = await Promise.all([
    supabase
      .from('companies')
      .select('*')
      .eq('user_id', user.id)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: true }),
    // v67 — check which companies have a customers mirror so the form
    // preselects the "Available as a customer" toggle correctly.
    supabase
      .from('customers')
      .select('mirrored_company_id')
      .eq('user_id', user.id)
      .not('mirrored_company_id', 'is', null),
  ])
  const mirroredCompanyIds = new Set(
    ((mirroredCustomers ?? []) as { mirrored_company_id: string | null }[])
      .map(r => r.mirrored_company_id)
      .filter((v): v is string => !!v)
  )

  const logoUrls: Record<string, string> = {}
  const docLogoUrls: Record<string, string> = {}
  const augmented = ((companies ?? []) as (Company & { document_logo_path?: string | null })[]).map(c => ({
    ...c,
    is_available_as_customer: mirroredCompanyIds.has(c.id),
  }))
  for (const c of augmented) {
    const ver = c.updated_at ? Date.parse(c.updated_at) : ''
    if (c.logo_path) {
      const { data: { publicUrl } } = supabase.storage.from('vaultr-avatars').getPublicUrl(c.logo_path)
      if (publicUrl) logoUrls[c.id] = `${publicUrl}?v=${ver}`
    }
    if (c.document_logo_path) {
      const { data: { publicUrl } } = supabase.storage.from('vaultr-avatars').getPublicUrl(c.document_logo_path)
      if (publicUrl) docLogoUrls[c.id] = `${publicUrl}?v=${ver}`
    }
  }

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 pb-6">
      <CompaniesClient initialCompanies={augmented} logoUrls={logoUrls} docLogoUrls={docLogoUrls} />
    </div>
  )
}
