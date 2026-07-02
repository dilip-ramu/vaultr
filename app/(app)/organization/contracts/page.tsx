export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ContractsClient, { type TemplateRow } from '@/components/organization/ContractsClient'

export default async function OrganizationContractsTab() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: templates }, { data: companies }, { data: emps }] = await Promise.all([
    supabase.from('contract_templates').select('*').eq('user_id', user.id).order('updated_at', { ascending: false }),
    supabase.from('companies').select('id, name, is_default').eq('user_id', user.id)
      .order('is_default', { ascending: false }).order('name'),
    supabase.from('employees').select('designation').eq('user_id', user.id),
  ])

  const companyName: Record<string, string> = {}
  for (const c of companies ?? []) companyName[c.id as string] = c.name as string

  const rows: TemplateRow[] = (templates ?? []).map(t => ({
    id: t.id as string,
    company_id: (t.company_id as string | null) ?? null,
    company_name: t.company_id ? (companyName[t.company_id as string] ?? 'Unknown company') : 'Personal',
    designation: t.designation as string,
    name: (t.name as string | null) ?? null,
    current_version: t.current_version as number,
    updated_at: t.updated_at as string,
  }))

  const designations = Array.from(new Set(
    (emps ?? []).map(e => (e.designation as string | null)?.trim()).filter((d): d is string => !!d),
  )).sort()

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <ContractsClient
        initialTemplates={rows}
        companies={(companies ?? []).map(c => ({ id: c.id as string, name: c.name as string }))}
        designations={designations}
      />
    </div>
  )
}
