'use client'

import { useState } from 'react'
import { Plus, Pencil, Trash2, Star, Building2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { confirmDialog } from '@/components/shared/ConfirmDialog'
import { notify } from '@/components/shared/Toast'
import CompanyForm, { type Company } from './CompanyForm'

interface Props {
  initialCompanies: Company[]
  logoUrls: Record<string, string>      // company_id → public URL (server-resolved)
}

export default function CompaniesClient({ initialCompanies, logoUrls: initialUrls }: Props) {
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
      <div className="flex items-center justify-between">
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          {companies.length} compan{companies.length === 1 ? 'y' : 'ies'} — the default is auto-selected when you create an invoice
        </p>
        <button
          onClick={() => { setEditing(null); setShowForm(true) }}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold text-white"
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
        <div className="space-y-3">
          {companies.map(c => (
            <div key={c.id} className="rounded-2xl border p-4 flex items-start gap-4" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
              {/* Logo */}
              <div className="w-14 h-14 rounded-xl overflow-hidden flex items-center justify-center shrink-0" style={{ background: 'var(--surface-2)' }}>
                {logoUrls[c.id]
                  ? <img src={logoUrls[c.id]} alt={c.name} className="w-full h-full object-contain" />
                  : <Building2 className="w-6 h-6" style={{ color: 'var(--text-muted)' }} />
                }
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold" style={{ color: 'var(--text)' }}>{c.name}</p>
                  {c.is_default && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-widest px-2 py-0.5 rounded-full" style={{ background: 'rgba(42,122,80,0.1)', color: 'var(--brand)' }}>
                      <Star className="w-2.5 h-2.5" /> Default
                    </span>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs" style={{ color: 'var(--text-muted)' }}>
                  {c.gstin && <span>GSTIN {c.gstin}</span>}
                  {c.email && <span>{c.email}</span>}
                  {c.phone && <span>{c.phone}</span>}
                  <span>Next invoice: {c.invoice_prefix}{String(c.next_invoice_number).padStart(6, '0')}</span>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {!c.is_default && (
                  <button onClick={() => setDefault(c)} className="p-1.5 rounded-lg hover:bg-[var(--surface-2)]" title="Set as default">
                    <Star className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
                  </button>
                )}
                <button onClick={() => { setEditing(c); setShowForm(true) }} className="p-1.5 rounded-lg hover:bg-[var(--surface-2)]" title="Edit">
                  <Pencil className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
                </button>
                <button onClick={() => handleDelete(c)} className="p-1.5 rounded-lg hover:bg-red-50" title="Delete">
                  <Trash2 className="w-4 h-4 text-red-400" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <CompanyForm
          company={editing}
          existingLogoUrl={editing ? logoUrls[editing.id] : undefined}
          onSaved={handleSaved}
          onClose={() => { setShowForm(false); setEditing(null) }}
        />
      )}
    </div>
  )
}
