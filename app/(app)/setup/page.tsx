import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import CompaniesClient from '@/components/company-details/CompaniesClient'
import type { Company } from '@/components/company-details/CompanyForm'

export const dynamic = 'force-dynamic'

export default async function SetupCompanyTabPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: companies } = await supabase
    .from('companies')
    .select('*')
    .eq('user_id', user.id)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: true })

  const logoUrls: Record<string, string> = {}
  for (const c of (companies ?? []) as Company[]) {
    if (c.logo_path) {
      const { data: { publicUrl } } = supabase.storage.from('vaultr-avatars').getPublicUrl(c.logo_path)
      if (publicUrl) logoUrls[c.id] = publicUrl
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pb-6">
      <CompaniesClient initialCompanies={(companies ?? []) as Company[]} logoUrls={logoUrls} />
    </div>
  )
}
