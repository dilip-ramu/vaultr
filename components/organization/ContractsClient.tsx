'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, Loader2, Trash2, History, FileText, ChevronDown, Save } from 'lucide-react'
import { notify } from '@/components/shared/Toast'
import { createClient } from '@/lib/supabase/client'
import { CONTRACT_PLACEHOLDERS } from '@/lib/contracts/variables'

const ATTACH_BUCKET = 'vaultr-attachments'

export interface TemplateRow {
  id: string
  company_id: string | null
  company_name: string
  designation: string
  name: string | null
  current_version: number
  updated_at: string
}
export interface JobDescRow {
  id: string
  company_id: string | null
  designation: string
  description: string
}

interface Company { id: string; name: string }

interface Props {
  initialTemplates: TemplateRow[]
  companies: Company[]
  designations: string[]
  initialJobDescriptions: JobDescRow[]
}

interface VersionRow { version: number; file_name: string | null; note: string | null; created_at: string; url: string | null }

const inputCls = 'w-full px-3 py-2 rounded-lg text-sm border outline-none'
const inputStyle = { background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' } as const

function fmtDate(d: string) { return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) }

export default function ContractsClient({ initialTemplates, companies, designations, initialJobDescriptions }: Props) {
  const router = useRouter()
  const companyName = (id: string | null) => (id ? (companies.find(c => c.id === id)?.name ?? 'Unknown') : null)

  // ── Template upload (one per company) ──
  const [companyId, setCompanyId] = useState<string>('')
  const [file, setFile] = useState<File | null>(null)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [showVars, setShowVars] = useState(false)
  const [versionsFor, setVersionsFor] = useState<TemplateRow | null>(null)
  const [versions, setVersions] = useState<VersionRow[] | null>(null)

  async function handleUpload() {
    if (!file) { notify('Choose a .docx file', 'error'); return }
    if (!file.name.toLowerCase().endsWith('.docx')) { notify('Choose a Word .docx file', 'error'); return }
    setBusy(true)
    try {
      // 1. Prepare — server finds/creates the template + returns a signed upload URL.
      const prep = await fetch('/api/contracts/templates', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ designation: '', company_id: companyId || null, name: name.trim() || null, file_name: file.name }),
      })
      const pd = await prep.json().catch(() => ({} as { error?: string; template_id?: string; version?: number; path?: string; token?: string }))
      if (!prep.ok || !pd.token || !pd.path) { notify(pd.error || `Upload failed (${prep.status})`, 'error'); return }

      // 2. Upload the file straight to Supabase Storage (no server body limit).
      const supabase = createClient()
      const { error: upErr } = await supabase.storage.from(ATTACH_BUCKET).uploadToSignedUrl(pd.path, pd.token, file, {
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      })
      if (upErr) { notify(upErr.message || 'File upload failed', 'error'); return }

      // 3. Finalize — record the version.
      const fin = await fetch('/api/contracts/templates/finalize', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template_id: pd.template_id, version: pd.version, path: pd.path, file_name: file.name, name: name.trim() || null }),
      })
      const fd2 = await fin.json().catch(() => ({} as { error?: string; version?: number }))
      if (!fin.ok) { notify(fd2.error || `Save failed (${fin.status})`, 'error'); return }

      notify(`Template saved (v${fd2.version ?? pd.version})`, 'success')
      setFile(null); setName('')
      router.refresh()
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Upload failed', 'error')
    } finally { setBusy(false) }
  }
  async function openVersions(t: TemplateRow) {
    setVersionsFor(t); setVersions(null)
    const res = await fetch(`/api/contracts/templates/${t.id}`)
    const data = await res.json()
    setVersions(res.ok ? (data.versions ?? []) : [])
  }
  async function deleteTemplate(t: TemplateRow) {
    if (!confirm(`Delete the contract template for ${t.company_name}? All versions are removed.`)) return
    const res = await fetch(`/api/contracts/templates/${t.id}`, { method: 'DELETE' })
    if (!res.ok) { notify('Delete failed', 'error'); return }
    notify('Template deleted', 'success'); router.refresh()
  }

  // ── Job descriptions ──
  const [jds, setJds] = useState<JobDescRow[]>(initialJobDescriptions)
  const [jdCompany, setJdCompany] = useState<string>('')
  const [jdDesignation, setJdDesignation] = useState('')
  const [jdText, setJdText] = useState('')
  const [jdBusy, setJdBusy] = useState(false)

  async function saveJd() {
    if (!jdDesignation.trim()) { notify('Enter a designation', 'error'); return }
    setJdBusy(true)
    try {
      const res = await fetch('/api/contracts/job-descriptions', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_id: jdCompany || null, designation: jdDesignation.trim(), description: jdText }),
      })
      const data = await res.json().catch(() => ({} as { error?: string; jobDescription?: JobDescRow }))
      if (!res.ok) { notify(data.error || `Save failed (${res.status})`, 'error'); return }
      // Replace any existing row with the same scope, then add the new one.
      setJds(prev => {
        const scope = (r: JobDescRow) => (r.company_id ?? '') === (jdCompany || '') && r.designation.toLowerCase() === jdDesignation.trim().toLowerCase()
        return [data.jobDescription as JobDescRow, ...prev.filter(r => !scope(r))]
      })
      setJdDesignation(''); setJdText(''); setJdCompany('')
      notify('Job description saved', 'success')
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Save failed', 'error')
    } finally { setJdBusy(false) }
  }
  function editJd(r: JobDescRow) { setJdCompany(r.company_id ?? ''); setJdDesignation(r.designation); setJdText(r.description) }
  async function deleteJd(r: JobDescRow) {
    const res = await fetch(`/api/contracts/job-descriptions/${r.id}`, { method: 'DELETE' })
    if (!res.ok) { notify('Delete failed', 'error'); return }
    setJds(prev => prev.filter(x => x.id !== r.id))
  }

  return (
    <div className="space-y-8">
      {/* ── Contract templates ── */}
      <div className="space-y-3">
        <div>
          <h2 className="text-lg font-bold" style={{ color: 'var(--text)' }}>Contract template</h2>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
            One Word (.docx) template per company. Use placeholders like <code style={{ color: 'var(--brand)' }}>{'{{employee.name}}'}</code> and <code style={{ color: 'var(--brand)' }}>{'{{job_description}}'}</code> — the job description is matched to each employee&apos;s designation automatically.
          </p>
        </div>

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
              <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Label (optional)</span>
              <input className={inputCls} style={inputStyle} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Standard employment contract" />
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border cursor-pointer" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }}>
              <Upload className="w-4 h-4" />{file ? file.name : 'Choose .docx'}
              <input type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="hidden" onChange={e => setFile(e.target.files?.[0] ?? null)} />
            </label>
            <button onClick={handleUpload} disabled={busy} className="px-4 py-2 rounded-lg text-sm font-semibold text-white flex items-center gap-1.5 disabled:opacity-50" style={{ background: 'var(--brand)' }}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}{busy ? 'Uploading…' : 'Save template'}
            </button>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Re-uploading for the same company adds a new version.</span>
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

        {initialTemplates.length === 0 ? (
          <div className="rounded-xl border text-center py-8" style={{ borderColor: 'var(--border)' }}>
            <FileText className="w-7 h-7 mx-auto mb-2" style={{ color: 'var(--text-muted)' }} />
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No contract template yet.</p>
          </div>
        ) : (
          <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
            <table className="w-full text-sm">
              <thead><tr style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}>
                <th className="text-left px-4 py-2.5 font-medium">Company</th>
                <th className="text-left px-4 py-2.5 font-medium">Version</th>
                <th className="text-left px-4 py-2.5 font-medium">Updated</th>
                <th className="px-4 py-2.5"></th>
              </tr></thead>
              <tbody>
                {initialTemplates.map(t => (
                  <tr key={t.id} style={{ borderTop: '1px solid var(--border)', color: 'var(--text)' }}>
                    <td className="px-4 py-2.5">{t.company_name}{t.designation ? <span className="text-xs" style={{ color: 'var(--text-muted)' }}> · {t.designation}</span> : null}{t.name ? <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{t.name}</div> : null}</td>
                    <td className="px-4 py-2.5">v{t.current_version}</td>
                    <td className="px-4 py-2.5" style={{ color: 'var(--text-muted)' }}>{fmtDate(t.updated_at)}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-end gap-3">
                        <button onClick={() => openVersions(t)} className="inline-flex items-center gap-1 text-xs" style={{ color: 'var(--text-muted)' }}><History className="w-3.5 h-3.5" />Versions</button>
                        <button onClick={() => deleteTemplate(t)} className="inline-flex items-center gap-1 text-xs text-red-500 hover:text-red-700"><Trash2 className="w-3.5 h-3.5" />Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Job descriptions ── */}
      <div className="space-y-3">
        <div>
          <h2 className="text-lg font-bold" style={{ color: 'var(--text)' }}>Job descriptions</h2>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
            One per designation. Injected into <code style={{ color: 'var(--brand)' }}>{'{{job_description}}'}</code> when a contract is generated. Leave the company as &quot;All companies&quot; unless a role differs by company.
          </p>
        </div>

        <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="space-y-1">
              <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Company</span>
              <select className={inputCls} style={inputStyle} value={jdCompany} onChange={e => setJdCompany(e.target.value)}>
                <option value="">All companies</option>
                {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Designation</span>
              <input className={inputCls} style={inputStyle} list="jd-designations" value={jdDesignation} onChange={e => setJdDesignation(e.target.value)} placeholder="Designer" />
              <datalist id="jd-designations">{designations.map(d => <option key={d} value={d} />)}</datalist>
            </label>
          </div>
          <label className="block space-y-1">
            <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Job description</span>
            <textarea className={inputCls} style={inputStyle} rows={4} value={jdText} onChange={e => setJdText(e.target.value)} placeholder="Responsibilities, scope, reporting line…" />
          </label>
          <button onClick={saveJd} disabled={jdBusy} className="px-4 py-2 rounded-lg text-sm font-semibold text-white flex items-center gap-1.5 disabled:opacity-50" style={{ background: 'var(--brand)' }}>
            {jdBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}{jdBusy ? 'Saving…' : 'Save job description'}
          </button>
        </div>

        {jds.length > 0 && (
          <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
            {jds.map(r => (
              <div key={r.id} className="px-4 py-3" style={{ borderTop: '1px solid var(--border)' }}>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>{r.designation}</span>
                    <span className="text-xs ml-2" style={{ color: 'var(--text-muted)' }}>{companyName(r.company_id) ?? 'All companies'}</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <button onClick={() => editJd(r)} className="text-xs font-medium" style={{ color: 'var(--brand)' }}>Edit</button>
                    <button onClick={() => deleteJd(r)} className="text-xs inline-flex items-center gap-1 text-red-500 hover:text-red-700"><Trash2 className="w-3.5 h-3.5" />Delete</button>
                  </div>
                </div>
                {r.description && <p className="text-xs mt-1 line-clamp-2" style={{ color: 'var(--text-muted)' }}>{r.description}</p>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Versions modal */}
      {versionsFor && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 sm:p-4" onClick={() => setVersionsFor(null)}>
          <div className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-xl" style={{ background: 'var(--surface)' }} onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
              <h3 className="text-base font-semibold" style={{ color: 'var(--text)' }}>{versionsFor.company_name}</h3>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Version history</p>
            </div>
            <div className="px-5 py-3 max-h-[60dvh] overflow-y-auto divide-y" style={{ borderColor: 'var(--border)' }}>
              {versions === null ? <div className="py-6 text-center"><Loader2 className="w-4 h-4 animate-spin inline" /></div>
                : versions.length === 0 ? <p className="py-6 text-center text-sm" style={{ color: 'var(--text-muted)' }}>No versions.</p>
                : versions.map(v => (
                  <div key={v.version} className="flex items-center justify-between py-2.5">
                    <div><div className="text-sm" style={{ color: 'var(--text)' }}>v{v.version} · {v.file_name ?? 'template.docx'}</div><div className="text-xs" style={{ color: 'var(--text-muted)' }}>{fmtDate(v.created_at)}</div></div>
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
