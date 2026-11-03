'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, Trash2, Download, Loader2, Paperclip } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { uploadAttachment } from '@/lib/upload'
import { notify } from '@/components/shared/Toast'
import { confirmDialog } from '@/components/shared/ConfirmDialog'

export interface OrderFileRow {
  id: string
  side: 'customer' | 'supplier'
  name: string
  path: string
  size: number
}

interface Props {
  orderId: string
  side: 'customer' | 'supplier'
  title: string
  blurb: string
  files: OrderFileRow[]
  locked: boolean
  children?: React.ReactNode
}

const kb = (n: number) => n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`

export default function OrderFilesPanel({ orderId, side, title, blurb, files, locked, children }: Props) {
  const router = useRouter()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  async function add(list: FileList | null) {
    if (!list?.length) return
    setBusy(true)
    try {
      const sb = createClient()
      const { data: { user } } = await sb.auth.getUser()
      if (!user) return
      const failed: string[] = []
      for (const file of Array.from(list)) {
        const up = await uploadAttachment(file, 'orders')
        if (!up.path) { failed.push(file.name); continue }
        const { error } = await sb.from('order_files').insert({
          order_id: orderId, user_id: user.id, side,
          name: file.name, path: up.path, size: file.size, mime: file.type || null,
        })
        if (error) failed.push(file.name)
      }
      if (failed.length) notify(`Could not add: ${failed.join(', ')}`, 'error')
      else notify(list.length === 1 ? 'File added ✓' : `${list.length} files added ✓`, 'success')
      router.refresh()
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }

  async function open(f: OrderFileRow) {
    const sb = createClient()
    const { data } = await sb.storage.from('vaultr-attachments').createSignedUrl(f.path, 300)
    if (!data?.signedUrl) { notify('Could not open that file', 'error'); return }
    window.open(data.signedUrl, '_blank', 'noopener')
  }

  async function remove(f: OrderFileRow) {
    if (!await confirmDialog(`Remove ${f.name} from this order?`)) return
    const sb = createClient()
    const { error } = await sb.from('order_files').delete().eq('id', f.id)
    if (error) { notify(error.message, 'error'); return }
    router.refresh()
  }

  return (
    <div className="rounded-2xl border p-5 space-y-3" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-extrabold" style={{ color: 'var(--text)' }}>{title}</h2>
          <p className="text-[12px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{blurb}</p>
        </div>
        {!locked && (
          <button onClick={() => input.current?.click()} disabled={busy} className="shrink-0 flex items-center gap-1.5 text-[12px] font-bold disabled:opacity-60" style={{ color: 'var(--brand)' }}>
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />} Add files
          </button>
        )}
        <input ref={input} type="file" multiple hidden onChange={e => add(e.target.files)} />
      </div>

      {files.length === 0 ? (
        <button onClick={() => !locked && input.current?.click()}
          className="w-full text-center py-7 rounded-xl text-[13px]"
          style={{ border: '1px dashed var(--border)', color: 'var(--text-faint)' }}>
          <Paperclip className="w-5 h-5 mx-auto mb-1.5" />
          Nothing here yet{locked ? '' : ' — drop in what belongs on this side'}
        </button>
      ) : (
        <div className="space-y-1.5">
          {files.map(f => (
            <div key={f.id} className="flex items-center justify-between gap-3 rounded-xl px-3 py-2" style={{ background: 'var(--surface-2)' }}>
              <button onClick={() => open(f)} className="min-w-0 text-left flex-1">
                <div className="text-[13px] font-semibold truncate" style={{ color: 'var(--text)' }}>{f.name}</div>
                <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{kb(f.size)}</div>
              </button>
              <div className="flex items-center gap-1.5 shrink-0">
                <button onClick={() => open(f)} className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'var(--surface)' }} aria-label="Open">
                  <Download className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
                </button>
                {!locked && (
                  <button onClick={() => remove(f)} className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'var(--surface)' }} aria-label="Remove">
                    <Trash2 className="w-3.5 h-3.5 text-[var(--expense)]" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {children}
    </div>
  )
}
