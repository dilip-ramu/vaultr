'use client'

import { useState } from 'react'
import { Plus, Pencil, Trash2, Star, Building2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { confirmDialog } from '@/components/shared/ConfirmDialog'
import { notify } from '@/components/shared/Toast'
import CompanyForm, { type Company } from './CompanyForm'
import EntityCard, { FaceField } from '@/components/shared/EntityCard'
import { autoColor } from '@/lib/card-gradient'

interface Props {
  initialCompanies: Company[]
  logoUrls: Record<string, string>      // company_id → public URL (server-resolved)
  docLogoUrls?: Record<string, string>  // company_id → document logo public URL
}

export default function CompaniesClient({ initialCompanies, logoUrls: initialUrls, docLogoUrls = {} }: Props) {
  const router = useRouter()
  const [companies, setCompanies] = useState<Company[]>(initialCompanies)
  const [logoUrls, setLogoUrls] = useState<Record<string, string>>(initialUrls)
  const [editing, setEditing] = useState<Company | null>(null)
  const [showForm, setShowForm] = useState(false)

  function handleSaved(saved: Company, newLogoUrl?: string) {
    setCompanies(prev => {
      const exists = prev.find(c => c.id === saved.id)
      // If this one was promoted to default, demote others client-side too.
      const demoted = saved.is_default ? prev.map(c => ({ ...c, is_default: c.id === saved.id })) : prev
      return exists
        ? demoted.map(c => c.id === saved.id ? saved : c)
        : [saved, ...demoted]
    })
    if (newLogoUrl !== undefined) {
      setLogoUrls(prev => ({ ...prev, [saved.id]: newLogoUrl }))
    }
    setShowForm(false); setEditing(null)
    router.refresh()
  }

  async function handleDelete(c: Company) {
    if (!await confirmDialog({
      title: `Delete "${c.name}"?`,
      message: 'Existing invoices issued from this company will stay, but the company link on them will be cleared.',
      confirmLabel: 'Delete',
    })) return
    const res = await fetch(`/api/companies/${c.id}`, { method: 'DELETE' })
    const data = await res.json()
    if (!res.ok) { notify(data.error || 'Delete failed', 'error'); return }
    setCompanies(prev => prev.filter(x => x.id !== c.id))
    notify(`"${c.name}" deleted`, 'success')
    router.refresh()
  }

  async function setDefault(c: Company) {
    if (c.is_default) return
    const res = await fetch(`/api/companies/${c.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_default: true }),
    })
    const data = await res.json()
    if (!res.ok) { notify(data.error || 'Could not set default', 'error'); return }
    setCompanies(prev => prev.map(x => ({ ...x, is_default: x.id === c.id })))
    notify(`"${c.name}" is now the default`, 'success')
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold tracking-tight" style={{ color: 'var(--text)' }}>Companies</h2>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {companies.length} compan{companies.length === 1 ? 'y' : 'ies'} · legal entities & GST
          </p>
        </div>
        <button
          onClick={() => { setEditing(null); setShowForm(true) }}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold text-white shrink-0"
          style={{ background: 'var(--brand)' }}
        >
          <Plus className="w-4 h-4" /> Add company
        </button>
      </div>

      {companies.length === 0 ? (
        <div className="py-12 text-center rounded-2xl border" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
          <Building2 className="w-8 h-8 mx-auto mb-2" style={{ color: 'var(--text-muted)' }} />
          <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>No companies yet</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Add your first company so you can issue invoices from it.</p>
        </div>
      ) : (
        <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
          {companies.map(c => {
            const color = autoColor(c.id, c.color)
            const iconBtn = 'w-8 h-8 rounded-lg flex items-center justify-center shrink-0'
            return (
              <EntityCard
                key={c.id}
                color={color}
                onClick={() => { setEditing(c); setShowForm(true) }}
                faceTop={<>
                  <span className="text-[10.5px] font-bold tracking-[0.1em] uppercase mt-1" style={{ color: 'rgba(255,255,255,0.8)' }}>Company</span>
                  <div className="w-12 h-12 rounded-lg overflow-hidden flex items-center justify-center shrink-0" style={{ background: 'rgba(255,255,255,0.9)' }}>
                    {logoUrls[c.id]
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={logoUrls[c.id]} alt={c.name} className="w-full h-full object-contain p-1" />
                      : <Building2 className="w-6 h-6" style={{ color: color }} />}
                  </div>
                </>}
                faceBottom={<>
                  <FaceField label="GSTIN" value={c.gstin || '—'} />
                </>}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="text-[15px] font-bold truncate" style={{ color: 'var(--text)' }}>{c.name}</p>
                      {c.is_default && <span className="inline-flex items-center gap-1 text-[9px] font-semibold uppercase tracking-widest px-1.5 py-0.5 rounded" style={{ background: 'color-mix(in srgb, var(--brand) 12%, transparent)', color: 'var(--brand)' }}><Star className="w-2.5 h-2.5" /> Default</span>}
                    </div>
                    {c.bank_name && <p className="text-[11px]" style={{ color: 'var(--text-faint)' }}>{c.bank_name}</p>}
                  </div>
                  <div className="flex gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                    {!c.is_default && <button onClick={() => setDefault(c)} className={iconBtn} style={{ background: 'var(--surface-2)' }} title="Set as default"><Star className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} /></button>}
                    <button onClick={() => { setEditing(c); setShowForm(true) }} className={iconBtn} style={{ background: 'var(--surface-2)' }} title="Edit"><Pencil className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} /></button>
                    <button onClick={() => handleDelete(c)} className={iconBtn} style={{ background: 'var(--surface-2)' }} title="Delete"><Trash2 className="w-3.5 h-3.5 text-[var(--expense)]" /></button>
                  </div>
                </div>

                <div className="mt-4">
                  <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Bank account</p>
                  <p className="text-[15px] font-bold tracking-tight tabular-nums" style={{ color: c.bank_account_number ? 'var(--text)' : 'var(--text-muted)' }}>{c.bank_account_number || '—'}</p>
                  {c.bank_ifsc && <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-faint)' }}>IFSC {c.bank_ifsc}{c.swift_code ? ` · SWIFT ${c.swift_code}` : ''}</p>}
                </div>

                <div className="mt-auto pt-3 flex flex-col gap-1" style={{ borderTop: '1px solid var(--border-2, var(--border))' }}>
                  {c.email && <span className="text-[12px] truncate" style={{ color: 'var(--text-muted)' }}>{c.email}</span>}
                  {c.phone && <span className="text-[12px]" style={{ color: 'var(--text-muted)' }}>{c.phone}</span>}
                  {c.address && <span className="text-[11px] truncate" style={{ color: 'var(--text-faint)' }}>{c.address}</span>}
                </div>
              </EntityCard>
            )
          })}
        </div>
      )}

      {showForm && (
        <CompanyForm
          company={editing}
          existingLogoUrl={editing ? logoUrls[editing.id] : undefined}
          existingDocLogoUrl={editing ? docLogoUrls[editing.id] : undefined}
          onSaved={handleSaved}
          onClose={() => { setShowForm(false); setEditing(null) }}
        />
      )}
    </div>
  )
}
