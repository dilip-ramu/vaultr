'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, Loader2, Trash2, History, FileText, ChevronDown } from 'lucide-react'
import { notify } from '@/components/shared/Toast'
import { CONTRACT_PLACEHOLDERS } from '@/lib/contracts/variables'

export interface TemplateRow {
  id: string
  company_id: string | null
  company_name: string
  designation: string
  name: string | null
  current_version: number
  updated_at: string
}

interface Props {
  initialTemplates: TemplateRow[]
  companies: { id: string; name: string }[]
  designations: string[]
}

interface VersionRow { version: number; file_name: string | null; note: string | null; created_at: string; url: string | null }

const inputCls = 'w-full px-3 py-2 rounded-lg text-sm border outline-none'
const inputStyle = { background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' } as const

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function ContractsClient({ initialTemplates, companies, designations }: Props) {
  const router = useRouter()
  const [companyId, setCompanyId] = useState<string>('')
  const [designation, setDesignation] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [showVars, setShowVars] = useState(false)
  const [versionsFor, setVersionsFor] = useState<TemplateRow | null>(null)
  const [versions, setVersions] = useState<VersionRow[] | null>(null)

  async function handleUpload() {
    if (!designation.trim()) { notify('Enter a designation', 'error'); return }
    if (!file) { notify('Choose a .docx file', 'error'); return }
    setBusy(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('designation', designation.trim())
      if (companyId) fd.append('company_id', companyId)
      if (name.trim()) fd.append('name', name.trim())
      const res = await fetch('/api/contracts/templates', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) { notify(data.error || 'Upload failed', 'error'); return }
      notify(`Template saved (v${data.version})`, 'success')
      setFile(null); setName('')
      router.refresh()
    } finally { setBusy(false) }
  }

  async function openVersions(t: TemplateRow) {
    setVersionsFor(t); setVersions(null)
    const res = await fetch(`/api/contracts/templates/${t.id}`)
    const data = await res.json()
    setVersions(res.ok ? (data.versions ?? []) : [])
  }

  async function handleDelete(t: TemplateRow) {
    if (!confirm(`Delete the ${t.designation} template for ${t.company_name}? All its versions are removed.`)) return
    const res = await fetch(`/api/contracts/templates/${t.id}`, { method: 'DELETE' })
    if (!res.ok) { const d = await res.json(); notify(d.error || 'Delete failed', 'error'); return }
    notify('Template deleted', 'success')
    router.refresh()
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold" style={{ color: 'var(--text)' }}>Contract templates</h2>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
          Upload a Word (.docx) template per company and designation. Employees get their contract generated from the matching template.
        </p>
      </div>

      {/* Upload / new version */}
      <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="space-y-1">
            <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Company</span>
            <select className={inputCls} style={inputStyle} value={companyId} onChange={e => setCompanyId(e.target.value)}>
              <option value="">Personal (no company)</option>
              {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Designation</span>
            <input className={inputCls} style={inputStyle} list="designations" value={designation}
              onChange={e => setDesignation(e.target.value)} placeholder="Designer" />
            <datalist id="designations">
              {designations.map(d => <option key={d} value={d} />)}
            </datalist>
          </label>
          <label className="space-y-1 sm:col-span-2">
            <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Label (optional)</span>
            <input className={inputCls} style={inputStyle} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Designer offer letter" />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border cursor-pointer" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }}>
            <Upload className="w-4 h-4" />
            {file ? file.name : 'Choose .docx'}
            <input type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="hidden" onChange={e => setFile(e.target.files?.[0] ?? null)} />
          </label>
          <button onClick={handleUpload} disabled={busy}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white flex items-center gap-1.5 disabled:opacity-50"
            style={{ background: 'var(--brand)' }}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {busy ? 'Uploading…' : 'Save template'}
          </button>
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Re-uploading for the same company + designation adds a new version.
          </span>
        </div>
      </div>

      {/* Placeholder reference */}
      <div className="rounded-xl border" style={{ borderColor: 'var(--border)' }}>
        <button onClick={() => setShowVars(v => !v)} className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium" style={{ color: 'var(--text)' }}>
          <span>Placeholders you can use in the .docx</span>
          <ChevronDown className={`w-4 h-4 transition-transform ${showVars ? 'rotate-180' : ''}`} />
        </button>
        {showVars && (
          <div className="px-4 pb-4 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
            {CONTRACT_PLACEHOLDERS.map(p => (
              <div key={p.tag} className="flex items-baseline gap-2 text-xs">
                <code className="font-mono px-1.5 py-0.5 rounded" style={{ background: 'var(--surface-2)', color: 'var(--brand)' }}>{p.tag}</code>
                <span style={{ color: 'var(--text-muted)' }}>{p.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Templates list */}
      {initialTemplates.length === 0 ? (
        <div className="rounded-xl border text-center py-10" style={{ borderColor: 'var(--border)' }}>
          <FileText className="w-8 h-8 mx-auto mb-2" style={{ color: 'var(--text-muted)' }} />
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No contract templates yet.</p>
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}>
                <th className="text-left px-4 py-2.5 font-medium">Company</th>
                <th className="text-left px-4 py-2.5 font-medium">Designation</th>
                <th className="text-left px-4 py-2.5 font-medium">Version</th>
                <th className="text-left px-4 py-2.5 font-medium">Updated</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {initialTemplates.map(t => (
                <tr key={t.id} style={{ borderTop: '1px solid var(--border)', color: 'var(--text)' }}>
                  <td className="px-4 py-2.5">{t.company_name}</td>
                  <td className="px-4 py-2.5">
                    {t.designation}
                    {t.name && <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{t.name}</div>}
                  </td>
                  <td className="px-4 py-2.5">v{t.current_version}</td>
                  <td className="px-4 py-2.5" style={{ color: 'var(--text-muted)' }}>{fmtDate(t.updated_at)}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center justify-end gap-3">
                      <button onClick={() => openVersions(t)} className="inline-flex items-center gap-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                        <History className="w-3.5 h-3.5" /> Versions
                      </button>
                      <button onClick={() => handleDelete(t)} className="inline-flex items-center gap-1 text-xs text-red-500 hover:text-red-700">
                        <Trash2 className="w-3.5 h-3.5" /> Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Versions modal */}
      {versionsFor && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 sm:p-4" onClick={() => setVersionsFor(null)}>
          <div className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-xl" style={{ background: 'var(--surface)' }} onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
              <h3 className="text-base font-semibold" style={{ color: 'var(--text)' }}>{versionsFor.designation} · {versionsFor.company_name}</h3>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Version history</p>
            </div>
            <div className="px-5 py-3 max-h-[60dvh] overflow-y-auto divide-y" style={{ borderColor: 'var(--border)' }}>
              {versions === null ? (
                <div className="py-6 text-center"><Loader2 className="w-4 h-4 animate-spin inline" /></div>
              ) : versions.length === 0 ? (
                <p className="py-6 text-center text-sm" style={{ color: 'var(--text-muted)' }}>No versions.</p>
              ) : versions.map(v => (
                <div key={v.version} className="flex items-center justify-between py-2.5">
                  <div>
                    <div className="text-sm" style={{ color: 'var(--text)' }}>v{v.version} · {v.file_name ?? 'template.docx'}</div>
                    <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{fmtDate(v.created_at)}</div>
                  </div>
                  {v.url && <a href={v.url} className="text-xs font-medium" style={{ color: 'var(--brand)' }}>Download</a>}
                </div>
              ))}
            </div>
            <div className="px-5 py-3 border-t flex justify-end" style={{ borderColor: 'var(--border)' }}>
              <button onClick={() => setVersionsFor(null)} className="px-4 py-2 rounded-xl text-sm" style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
