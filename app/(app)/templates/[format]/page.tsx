import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import TemplateDesigner from '@/components/templates/TemplateDesigner'
import { templateFormat } from '@/lib/documents/templateFormats'
import { normalizeAccent } from '@/lib/companies/templates'

export const dynamic = 'force-dynamic'

export default async function TemplateFormatPage({ params }: { params: Promise<{ format: string }> }) {
  const { format } = await params
  const fmt = templateFormat(format)
  if (!fmt || format === 'cheque') notFound()   // cheque has its own editor

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: companies } = await supabase.from('companies')
    .select('id, name, invoice_accent').eq('user_id', user!.id)
    .order('is_default', { ascending: false }).order('name')

  const companyOpts = (companies ?? []).map(c => ({ id: c.id as string, name: c.name as string, accent: normalizeAccent(c.invoice_accent as string | null) }))

  return (
    <div className="w-full px-4 md:px-8 py-6">
      <div className="mb-4">
        <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: 'var(--text)' }}>{fmt.label} template</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>Design the {fmt.label.toLowerCase()} layout per company. Drag anything, resize, add text boxes or dynamic fields, then Save. Saved templates print automatically.</p>
      </div>
      <TemplateDesigner format={format} companies={companyOpts} />
    </div>
  )
}
