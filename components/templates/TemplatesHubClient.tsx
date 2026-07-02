'use client'

import { useState } from 'react'
import TemplateStudioClient, { type TemplateListItem, type AssignmentRow } from './TemplateStudioClient'
import type { DocType } from '@/lib/templates/schema'

interface CompanyItem { id: string; name: string; accent: string }
interface DocData { templates: TemplateListItem[]; assignments: AssignmentRow[] }

interface Props {
  companies: CompanyItem[]
  gst: DocData
  reimbursable: DocData
}

const TABS: { id: DocType; label: string }[] = [
  { id: 'gst_invoice', label: 'GST tax invoice' },
  { id: 'reimbursable_invoice', label: 'Reimbursable invoice' },
]

export default function TemplatesHubClient({ companies, gst, reimbursable }: Props) {
  const [tab, setTab] = useState<DocType>('gst_invoice')
  const data = tab === 'gst_invoice' ? gst : reimbursable
  const label = tab === 'gst_invoice' ? 'GST invoice' : 'reimbursable invoice'

  return (
    <div className="space-y-5">
      <div className="flex gap-1 p-1 rounded-xl overflow-x-auto" style={{ background: 'var(--surface-2)' }} role="tablist">
        {TABS.map(t => {
          const active = t.id === tab
          return (
            <button key={t.id} role="tab" aria-selected={active} onClick={() => setTab(t.id)}
              className="px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap"
              style={active ? { background: 'var(--background)', color: 'var(--text)', boxShadow: '0 1px 3px rgba(0,0,0,.1)' } : { color: 'var(--text-muted)' }}>
              {t.label}
            </button>
          )
        })}
      </div>

      <TemplateStudioClient
        key={tab}
        docType={tab}
        docLabel={label}
        initialTemplates={data.templates}
        companies={companies}
        initialAssignments={data.assignments}
      />
    </div>
  )
}
