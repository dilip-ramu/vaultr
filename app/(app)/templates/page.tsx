export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import TemplateStudioClient, { type TemplateListItem, type AssignmentRow } from '@/components/templates/TemplateStudioClient'

export default async function TemplatesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: templates }, { data: companies }, { data: assignments }] = await Promise.all([
    supabase.from('document_templates').select('id, doc_type, name, updated_at')
      .eq('user_id', user.id).eq('doc_type', 'gst_invoice').order('updated_at', { ascending: false }),
    supabase.from('companies').select('id, name, is_default, invoice_accent')
      .eq('user_id', user.id).order('is_default', { ascending: false }).order('name'),
    supabase.from('document_template_assignments').select('company_id, doc_type, template_id')
      .eq('user_id', user.id).eq('doc_type', 'gst_invoice'),
  ])

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="mb-4">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>Templates</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
          Design your documents. GST tax invoice is available now — reimbursable invoice and salary slip come next.
        </p>
      </div>
      <TemplateStudioClient
        initialTemplates={(templates ?? []) as TemplateListItem[]}
        companies={(companies ?? []).map(c => ({ id: c.id as string, name: c.name as string, accent: (c.invoice_accent as string | null) ?? '#2A7A50' }))}
        initialAssignments={(assignments ?? []) as AssignmentRow[]}
      />
    </div>
  )
}
