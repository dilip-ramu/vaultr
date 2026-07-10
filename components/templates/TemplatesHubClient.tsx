'use client'

import { useState } from 'react'
import TemplateStudioClient, { type TemplateListItem, type AssignmentRow } from './TemplateStudioClient'
import { DOC_TYPES, type DocType } from '@/lib/templates/schema'

interface CompanyItem { id: string; name: string; accent: string }
export interface DocData { templates: TemplateListItem[]; assignments: AssignmentRow[] }

interface Props {
  companies: CompanyItem[]
  /** Templates + assignments keyed by doc type. */
  byType: Record<string, DocData>
}

const EMPTY: DocData = { templates: [], assignments: [] }

export default function TemplatesHubClient({ companies, byType }: Props) {
  const [tab, setTab] = useState<DocType>('gst_invoice')
  const meta = DOC_TYPES.find(d => d.id === tab)!
  const data = byType[tab] ?? EMPTY

  return (
    <div className="space-y-5">
      <div className="flex gap-1 p-1 rounded-xl overflow-x-auto" style={{ background: 'var(--surface-2)' }} role="tablist">
        {DOC_TYPES.map(t => {
          const active = t.id === tab
          return (
            <button key={t.id} role="tab" aria-selected={active} onClick={() => setTab(t.id)}
              className="px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap"
              style={active ? { background: 'var(--background)', color: 'var(--text)', boxShadow: 'var(--shadow)' } : { color: 'var(--text-muted)' }}>
              {t.label}
            </button>
          )
        })}
      </div>

      <TemplateStudioClient
        key={tab}
        docType={tab}
        docLabel={meta.short}
        initialTemplates={data.templates}
        companies={companies}
        initialAssignments={data.assignments}
      />
    </div>
  )
}
