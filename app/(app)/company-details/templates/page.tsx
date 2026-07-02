import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import TemplatesClient from '@/components/company-details/TemplatesClient'
import type { Company } from '@/components/company-details/CompanyForm'

export const dynamic = 'force-dynamic'

export default async function CompanyTemplatesTab() {
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

  return <TemplatesClient initialCompanies={(companies ?? []) as Company[]} logoUrls={logoUrls} />
}
