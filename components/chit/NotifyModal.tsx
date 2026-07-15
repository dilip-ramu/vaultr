'use client'

// Send a chit message to members over WhatsApp.
//
// Delivery is a wa.me deep link per member — it opens WhatsApp with the message
// already typed, needing no API key and no approval. The trade-off: WhatsApp
// opens one chat at a time, so you tap each member (or copy the text into a
// broadcast list). True hands-off bulk sending needs Meta's WhatsApp Business
// Cloud API — approved templates, a phone-number ID, tokens — which is a separate
// setup; this works today, from your phone, for a group of twenty.

import { useState } from 'react'
import { X, Copy, Check } from 'lucide-react'
import { whatsappLink } from '@/lib/chit/messages'
import { notify } from '@/components/shared/Toast'
import type { ChitMember } from '@/lib/chit/types'

export interface NotifyTarget {
  id: string
  name: string
  dial_code: string
  phone: string | null
}

export default function NotifyModal({ title, message: initial, targets, onClose }: {
  title: string
  message: string
  targets: NotifyTarget[]
  onClose: () => void
}) {
  const [message, setMessage] = useState(initial)
  const [sent, setSent] = useState<Set<string>>(new Set())
  const [copied, setCopied] = useState(false)

  const withPhone = targets.filter(t => t.phone)
  const noPhone = targets.filter(t => !t.phone)

  function send(t: NotifyTarget) {
    window.open(whatsappLink(t.dial_code || '91', t.phone || '', message), '_blank')
    setSent(s => new Set(s).add(t.id))
  }

  async function copy() {
    try { await navigator.clipboard.writeText(message); setCopied(true); setTimeout(() => setCopied(false), 1500) }
    catch { notify('Could not copy', 'error') }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end md:items-center justify-center">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full md:max-w-lg rounded-t-3xl md:rounded-2xl p-6 shadow-xl slide-up max-h-[92vh] overflow-y-auto" style={{ background: 'var(--surface)' }}>
        <div className="flex items-center justify-between mb-3">
          <p className="text-base font-extrabold" style={{ color: 'var(--text)' }}>{title}</p>
          <button onClick={onClose} style={{ color: 'var(--text-faint)' }}><X className="w-4 h-4" /></button>
        </div>

        {/* The message, editable — tweak before you send. */}
        <textarea value={message} onChange={e => setMessage(e.target.value)} rows={10}
          className="w-full px-3 py-2.5 rounded-xl border text-[12.5px] outline-none font-mono leading-relaxed"
          style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }} />

        <button onClick={copy}
          className="flex items-center gap-1.5 text-[12px] font-bold px-3 py-1.5 rounded-lg mt-2"
          style={{ border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
          {copied ? <><Check className="w-3.5 h-3.5" /> Copied</> : <><Copy className="w-3.5 h-3.5" /> Copy message</>}
        </button>

        <p className="text-[11px] mt-4 mb-1.5 font-bold uppercase tracking-wide" style={{ color: 'var(--text-faint)' }}>
          Send to {withPhone.length} member{withPhone.length === 1 ? '' : 's'}
        </p>
        <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
          {withPhone.map((t, i) => (
            <div key={t.id} className="flex items-center gap-3 px-3.5 py-2.5" style={{ borderTop: i > 0 ? '1px solid var(--border)' : undefined, background: sent.has(t.id) ? 'rgba(37,211,102,.08)' : 'var(--surface)' }}>
              <span className="min-w-0 flex-1">
                <span className="text-[13px] font-semibold block truncate" style={{ color: 'var(--text)' }}>{t.name}</span>
                <span className="text-[11px]" style={{ color: 'var(--text-faint)' }}>+{t.dial_code} {t.phone}</span>
              </span>
              <button onClick={() => send(t)}
                className="text-[12px] font-bold px-3 py-1.5 rounded-lg shrink-0 text-white"
                style={{ background: sent.has(t.id) ? '#1a8a4a' : '#25D366' }}>
                {sent.has(t.id) ? 'Sent ✓ · again' : 'WhatsApp'}
              </button>
            </div>
          ))}
        </div>

        {noPhone.length > 0 && (
          <p className="text-[11px] mt-2" style={{ color: '#b7791f' }}>
            {noPhone.length} member{noPhone.length === 1 ? ' has' : 's have'} no phone number: {noPhone.map(t => t.name).join(', ')}
          </p>
        )}
      </div>
    </div>
  )
}

export const toTarget = (m: Pick<ChitMember, 'id' | 'name' | 'dial_code' | 'phone'>): NotifyTarget =>
  ({ id: m.id, name: m.name, dial_code: m.dial_code || '91', phone: m.phone })
