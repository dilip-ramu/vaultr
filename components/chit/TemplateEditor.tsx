'use client'

// Writing the WhatsApp templates here instead of in WhatsApp Manager.
//
// WHY IT LOOKS LIKE THIS
//
// A template is reviewed by Meta for up to 24 hours, and once APPROVED it may
// be edited only 10 times in 30 days and once in 24 hours. So a mistake is not
// a quick fix: you learn about it tomorrow and you spend one of your edits
// correcting it. Everything Meta publishes as a rejection reason is therefore
// checked as you type, not after you submit — see lib/whatsapp/templateSpec.ts.
//
// The preview matters as much as the rules. A template reads differently with
// real figures in it, and 'overdue by 0 days' is the kind of sentence nobody
// notices until a member receives it.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, RefreshCw, Send } from 'lucide-react'
import { notify } from '@/components/shared/Toast'
import {
  problems, preview, statusWords, editsLeft,
  type TemplateDraft, type TemplateStatus, type TemplateCategory,
} from '@/lib/whatsapp/templateSpec'

export interface TemplateRow {
  kind: string
  label: string
  draft: TemplateDraft
  status: TemplateStatus
  categoryAssigned: string | null
  rejectedReason: string | null
  editTimes: string[]
}

export default function TemplateEditor({ rows, connected }: {
  rows: TemplateRow[]
  /** Whether a WhatsApp business account is connected. */
  connected: boolean
}) {
  const router = useRouter()
  const [drafts, setDrafts] = useState<Record<string, TemplateDraft>>(
    Object.fromEntries(rows.map(r => [r.kind, r.draft])))
  const [busy, setBusy] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [open, setOpen] = useState<string | null>(rows[0]?.kind ?? null)

  const card = { border: '1px solid var(--border)', background: 'var(--surface)' }
  const field = 'w-full px-3 py-2 rounded-lg border text-[13px] mt-1'
  const fieldStyle = { background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }

  function edit(kind: string, patch: Partial<TemplateDraft>) {
    setDrafts(prev => ({ ...prev, [kind]: { ...prev[kind], ...patch } }))
  }

  async function submit(kind: string) {
    const draft = drafts[kind]
    setBusy(kind)
    try {
      const res = await fetch('/api/whatsapp/templates', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, draft }),
      })
      const data = await res.json()
      if (!res.ok) { notify(data.error ?? 'Meta refused it', 'error'); return }
      notify(data.status === 'DRAFT'
        ? 'Saved. It will be submitted once WhatsApp is connected.'
        : 'Sent to Meta — a decision usually comes within 24 hours.', 'success')
      router.refresh()
    } finally { setBusy(null) }
  }

  async function refresh() {
    setRefreshing(true)
    try {
      const res = await fetch('/api/whatsapp/templates')
      const data = await res.json()
      if (!res.ok) { notify(data.error ?? 'Could not ask Meta', 'error'); return }
      notify(data.note ?? `${data.refreshed} checked with Meta`, 'success')
      router.refresh()
    } finally { setRefreshing(false) }
  }

  return (
    <div className="rounded-2xl overflow-hidden" style={card}>
      <div className="px-4 py-2.5 flex flex-wrap items-center justify-between gap-2"
        style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
        <p className="text-[11px] font-extrabold uppercase tracking-wide" style={{ color: 'var(--text-faint)' }}>
          Message templates
        </p>
        <button onClick={refresh} disabled={refreshing}
          className="inline-flex items-center gap-1.5 text-[12px] font-bold" style={{ color: 'var(--brand)' }}>
          {refreshing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          Check with Meta
        </button>
      </div>

      <p className="px-4 pt-3 text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
        Write them here and submit from here. Meta holds the approved wording — that is what members
        actually receive — and reviews each one for up to 24 hours. An approved template can be edited
        only once a day and ten times a month, so the checks below run before anything is sent.
        {!connected && ' No WhatsApp account is connected yet, so these are saved as drafts.'}
      </p>

      {rows.map(r => {
        const d = drafts[r.kind]
        const found = problems(d)
        const left = editsLeft(r.editTimes)
        const isOpen = open === r.kind
        const statusTone = r.status === 'APPROVED' ? 'var(--income)'
          : r.status === 'REJECTED' || r.status === 'DISABLED' ? 'var(--expense)'
          : r.status === 'PENDING' ? 'var(--text-muted)' : 'var(--text-faint)'

        return (
          <div key={r.kind} style={{ borderTop: '1px solid var(--border)' }}>
            <button onClick={() => setOpen(isOpen ? null : r.kind)}
              className="w-full px-4 py-3 flex items-center justify-between gap-3 text-left">
              <div className="min-w-0">
                <p className="text-[13px] font-semibold" style={{ color: 'var(--text)' }}>{r.label}</p>
                <p className="text-[11px]" style={{ color: 'var(--text-faint)' }}>{d.name}</p>
              </div>
              <span className="text-[11px] font-bold shrink-0" style={{ color: statusTone }}>
                {r.status.toLowerCase()}
              </span>
            </button>

            {isOpen && (
              <div className="px-4 pb-4 space-y-3">
                <p className="text-[11.5px]" style={{ color: statusTone }}>
                  {statusWords(r.status, r.categoryAssigned, d.category)}
                </p>
                {r.rejectedReason && (
                  <p className="text-[11.5px] rounded-lg px-3 py-2"
                    style={{ background: 'color-mix(in srgb, var(--expense) 10%, transparent)', color: 'var(--expense)' }}>
                    Meta said: {r.rejectedReason}
                  </p>
                )}

                <label className="block text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>
                  The message
                  <textarea value={d.body} onChange={e => edit(r.kind, { body: e.target.value })}
                    rows={4} className={field} style={fieldStyle} />
                  <span className="block mt-1 text-[10.5px] font-normal" style={{ color: 'var(--text-faint)' }}>
                    Put {'{{1}}'}, {'{{2}}'} where the figures go. It cannot start or end with one.
                  </span>
                </label>

                {/* What each variable is, and the example Meta asks for. */}
                <div className="space-y-1.5">
                  {d.variables.map((v, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-[11.5px] w-8 shrink-0 tabular-nums" style={{ color: 'var(--text-faint)' }}>
                        {`{{${i + 1}}}`}
                      </span>
                      <span className="text-[11.5px] flex-1 min-w-0 truncate" style={{ color: 'var(--text-muted)' }}>{v.label}</span>
                      <input value={v.sample} placeholder="example"
                        onChange={e => edit(r.kind, {
                          variables: d.variables.map((x, j) => j === i ? { ...x, sample: e.target.value } : x),
                        })}
                        className="w-32 px-2 py-1 rounded-lg border text-[12px]" style={fieldStyle} />
                    </div>
                  ))}
                </div>

                <label className="block text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>
                  Footer (optional, no variables)
                  <input value={d.footer ?? ''} onChange={e => edit(r.kind, { footer: e.target.value })}
                    className={field} style={fieldStyle} placeholder="Sri Uma Chits" />
                </label>

                <label className="block text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>
                  Ask Meta for
                  <select value={d.category} onChange={e => edit(r.kind, { category: e.target.value as TemplateCategory })}
                    className={field} style={fieldStyle}>
                    <option value="UTILITY">utility — about their own account</option>
                    <option value="MARKETING">marketing — promotional</option>
                  </select>
                  <span className="block mt-1 text-[10.5px] font-normal" style={{ color: 'var(--text-faint)' }}>
                    Meta decides in the end. Marketing costs roughly 7.5&times; more per message.
                  </span>
                </label>

                {/* The preview, with the examples filled in. */}
                <div className="rounded-xl px-3 py-2.5" style={{ background: 'var(--surface-2)' }}>
                  <p className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: 'var(--text-faint)' }}>
                    What a member sees
                  </p>
                  <p className="text-[12.5px] whitespace-pre-wrap" style={{ color: 'var(--text)' }}>{preview(d)}</p>
                  {d.footer && <p className="text-[11px] mt-1" style={{ color: 'var(--text-faint)' }}>{d.footer}</p>}
                </div>

                {found.length > 0 && (
                  <ul className="space-y-1">
                    {found.map((p, i) => (
                      <li key={i} className="text-[11.5px]" style={{ color: 'var(--expense)' }}>· {p.message}</li>
                    ))}
                  </ul>
                )}

                <div className="flex items-center justify-between gap-3">
                  <span className="text-[11px]" style={{ color: 'var(--text-faint)' }}>
                    {r.status === 'APPROVED'
                      ? `${left.in24h} edit left today, ${left.in30d} this month`
                      : 'Unlimited edits until it is approved'}
                  </span>
                  <button onClick={() => submit(r.kind)} disabled={found.length > 0 || busy === r.kind}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-white text-[13px] font-bold disabled:opacity-50"
                    style={{ background: 'var(--brand)' }}>
                    {busy === r.kind ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    {connected ? 'Submit to Meta' : 'Save draft'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
