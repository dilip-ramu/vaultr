import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import CompaniesClient from '@/components/company-details/CompaniesClient'
import type { Company } from '@/components/company-details/CompanyForm'

export const dynamic = 'force-dynamic'

export default async function CompanyDetailsTabPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: companies } = await supabase
    .from('companies')
    .select('*')
    .eq('user_id', user.id)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: true })

  // Resolve public URLs for any companies with a logo
  const logoUrls: Record<string, string> = {}
  for (const c of (companies ?? []) as Company[]) {
    if (c.logo_path) {
      const { data: { publicUrl } } = supabase.storage.from('vaultr-avatars').getPublicUrl(c.logo_path)
      // Cache-bust with updated_at — the logo path is reused on re-upload.
      if (publicUrl) logoUrls[c.id] = `${publicUrl}?v=${c.updated_at ? Date.parse(c.updated_at) : ''}`
    }
  }

  return <CompaniesClient initialCompanies={(companies ?? []) as Company[]} logoUrls={logoUrls} />
}
