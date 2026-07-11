import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import TemplateDesigner, { type CompanyTpl } from '@/components/templates/TemplateDesigner'
import { templateFormat } from '@/lib/documents/templateFormats'
import { normalizeAccent } from '@/lib/companies/templates'
import type { DocLayout } from '@/lib/documents/layout'

export const dynamic = 'force-dynamic'

export default async function TemplateFormatPage({ params }: { params: Promise<{ format: string }> }) {
  const { format } = await params
  const fmt = templateFormat(format)
  // cheque + contract have their own dedicated editors
  if (!fmt || format === 'cheque' || format === 'contract') notFound()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const uid = user!.id

  const [{ data: companies }, { data: layouts }] = await Promise.all([
    supabase.from('companies')
      .select('id, name, invoice_accent, logo_path, document_logo_path')
      .eq('user_id', uid).order('is_default', { ascending: false }).order('name'),
    supabase.from('document_layouts').select('company_id, schema').eq('user_id', uid).eq('format', format),
  ])

  const layoutByCompany = new Map<string, DocLayout>()
  for (const l of layouts ?? []) layoutByCompany.set(l.company_id as string, l.schema as DocLayout)

  const items: CompanyTpl[] = (companies ?? []).map(c => {
    const path = (c.document_logo_path as string | null) ?? (c.logo_path as string | null)
    const logoUrl = path ? (supabase.storage.from('vaultr-avatars').getPublicUrl(path).data?.publicUrl ?? null) : null
    return {
      id: c.id as string,
      name: c.name as string,
      accent: normalizeAccent(c.invoice_accent as string | null),
      logoUrl,
      layout: layoutByCompany.get(c.id as string) ?? null,
    }
  })

  return (
    <div className="w-full px-4 md:px-8 py-6">
      <div className="mb-5">
        <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: 'var(--text)' }}>{fmt.label} template</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
          How the {fmt.label.toLowerCase()} looks for each company. Click a template to open it larger, or Edit to redesign it.
        </p>
      </div>
      <TemplateDesigner format={format} companies={items} />
    </div>
  )
}
