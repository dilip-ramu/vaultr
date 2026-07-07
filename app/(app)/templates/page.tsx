export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import TemplatesHubClient from '@/components/templates/TemplatesHubClient'
import type { TemplateListItem, AssignmentRow } from '@/components/templates/TemplateStudioClient'

export default async function TemplatesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: templates }, { data: companies }, { data: assignments }] = await Promise.all([
    supabase.from('document_templates').select('id, doc_type, name, updated_at')
      .eq('user_id', user.id).in('doc_type', ['gst_invoice', 'reimbursable_invoice', 'salary_slip']).order('updated_at', { ascending: false }),
    supabase.from('companies').select('id, name, is_default, invoice_accent')
      .eq('user_id', user.id).order('is_default', { ascending: false }).order('name'),
    supabase.from('document_template_assignments').select('company_id, doc_type, template_id')
      .eq('user_id', user.id).in('doc_type', ['gst_invoice', 'reimbursable_invoice', 'salary_slip']),
  ])

  const tpl = (templates ?? []) as TemplateListItem[]
  const asg = (assignments ?? []) as AssignmentRow[]
  const forType = (dt: string) => ({
    templates: tpl.filter(t => t.doc_type === dt),
    assignments: asg.filter(a => a.doc_type === dt),
  })

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 py-6">
      <div className="mb-4">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>Templates</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
          Design your documents block by block — GST invoice, reimbursable invoice, and salary slip.
        </p>
      </div>
      <TemplatesHubClient
        companies={(companies ?? []).map(c => ({ id: c.id as string, name: c.name as string, accent: (c.invoice_accent as string | null) ?? '#2A7A50' }))}
        gst={forType('gst_invoice')}
        reimbursable={forType('reimbursable_invoice')}
        salarySlip={forType('salary_slip')}
      />
    </div>
  )
}
