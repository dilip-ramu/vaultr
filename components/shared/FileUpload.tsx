'use client'

import { useState, useRef } from 'react'
import { Paperclip, X, FileText, Loader2, Camera, Download, ZoomIn, ChevronLeft, ChevronRight } from 'lucide-react'
import type { Attachment } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'
import { confirmDialog } from '@/components/shared/ConfirmDialog'
import { uploadAttachment } from '@/lib/upload'
import { useFileDrop } from '@/components/shared/useFileDrop'

interface Props {
  transactionId?: string
  billId?: string
  existingAttachments?: Attachment[]
  onAttachmentsChange?: (attachments: Attachment[]) => void
}

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
const MAX_SIZE = 10 * 1024 * 1024 // 10MB

// ── Lightbox ──────────────────────────────────────────────────────────────────
function Lightbox({
  attachments,
  index,
  onClose,
}: {
  attachments: { url: string; name: string; type: string }[]
  index: number
  onClose: () => void
}) {
  const [current, setCurrent] = useState(index)
  const att = attachments[current]

  const prev = () => setCurrent(i => Math.max(0, i - 1))
  const next = () => setCurrent(i => Math.min(attachments.length - 1, i + 1))

  const handleDownload = async () => {
    try {
      const res = await fetch(att.url)
      const blob = await res.blob()
      const blobUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = att.name
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(blobUrl)
    } catch {
      window.location.href = att.url
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col"
      style={{ backgroundColor: 'rgba(0,0,0,0.95)' }}
    >
      {/* Top bar */}
      <div
        className="flex items-center justify-between px-4 shrink-0"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)', paddingBottom: 12 }}
      >
        <button onClick={onClose} className="w-9 h-9 rounded-full flex items-center justify-center bg-[var(--surface)]/10">
          <X className="w-5 h-5 text-white" />
        </button>
        <p className="text-white text-sm font-medium truncate flex-1 mx-4 text-center">{att.name}</p>
        <button
          onClick={handleDownload}
          className="w-9 h-9 rounded-full flex items-center justify-center bg-[var(--surface)]/10"
        >
          <Download className="w-5 h-5 text-white" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 flex items-center justify-center overflow-hidden px-2">
        {att.type.startsWith('image/') ? (
          <img
            src={att.url}
            alt={att.name}
            className="max-w-full max-h-full object-contain rounded-lg"
            style={{ maxHeight: 'calc(100dvh - 160px)' }}
          />
        ) : (
          <div className="flex flex-col items-center gap-5 px-6 text-center">
            <div className="w-20 h-20 rounded-2xl flex items-center justify-center" style={{ backgroundColor: 'color-mix(in srgb, var(--expense) 20%, transparent)' }}>
              <FileText className="w-10 h-10 " />
            </div>
            <p className="text-white font-semibold">{att.name}</p>
            <p className="text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>PDF preview isn&apos;t supported in the app.</p>
            <button
              onClick={handleDownload}
              className="flex items-center gap-2 px-6 py-3 rounded-2xl text-white font-semibold"
              style={{ backgroundColor: 'var(--brand)' }}
            >
              <Download className="w-4 h-4" />
              Download PDF
            </button>
          </div>
        )}
      </div>

      {/* Nav arrows */}
      {attachments.length > 1 && (
        <div
          className="flex items-center justify-center gap-6 shrink-0"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)', paddingTop: 16 }}
        >
          <button
            onClick={prev}
            disabled={current === 0}
            className="w-10 h-10 rounded-full bg-[var(--surface)]/10 flex items-center justify-center disabled:opacity-30"
          >
            <ChevronLeft className="w-5 h-5 text-white" />
          </button>
          <span className="text-sm" style={{ color: 'rgba(255,255,255,0.6)' }}>{current + 1} / {attachments.length}</span>
          <button
            onClick={next}
            disabled={current === attachments.length - 1}
            className="w-10 h-10 rounded-full bg-[var(--surface)]/10 flex items-center justify-center disabled:opacity-30"
          >
            <ChevronRight className="w-5 h-5 text-white" />
          </button>
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function FileUpload({ transactionId, billId, existingAttachments = [], onAttachmentsChange }: Props) {
  const [attachments, setAttachments] = useState<Attachment[]>(existingAttachments)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [lightbox, setLightbox] = useState<{ urls: { url: string; name: string; type: string }[]; index: number } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)
  const { dragOver, dropProps } = useFileDrop(files => handleFiles(files), { disabled: uploading })

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setUploading(true)
    setError('')

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError('Not authenticated'); setUploading(false); return }

    const newAttachments: Attachment[] = []

    for (const file of Array.from(files)) {
      if (!ALLOWED_TYPES.includes(file.type)) {
        setError(`${file.name}: Only images and PDFs allowed`)
        continue
      }
      if (file.size > MAX_SIZE) {
        setError(`${file.name}: File too large (max 10MB)`)
        continue
      }

      const up = await uploadAttachment(file)
      if (up.error || !up.path) { setError(up.error ?? 'Upload failed'); continue }

      const { data: record } = await supabase.from('attachments').insert({
        user_id: user.id,
        transaction_id: transactionId ?? null,
        bill_id: billId ?? null,
        file_path: up.path,
        file_name: file.name,
        file_size: file.size,
        content_type: file.type,
      }).select().single()

      if (record) newAttachments.push(record)
    }

    const updated = [...attachments, ...newAttachments]
    setAttachments(updated)
    onAttachmentsChange?.(updated)
    setUploading(false)
  }

  const handleDelete = async (attachment: Attachment) => {
    if (!await confirmDialog(`Delete "${attachment.file_name}"?`)) return
    const supabase = createClient()
    await supabase.storage.from('vaultr-attachments').remove([attachment.file_path])
    await supabase.from('attachments').delete().eq('id', attachment.id)
    const updated = attachments.filter(a => a.id !== attachment.id)
    setAttachments(updated)
    onAttachmentsChange?.(updated)
  }

  // Open lightbox — fetch signed URLs for all attachments first
  const openLightbox = async (clickedIndex: number) => {
    const supabase = createClient()
    const urls = await Promise.all(
      attachments.map(async att => {
        const { data } = await supabase.storage
          .from('vaultr-attachments')
          .createSignedUrl(att.file_path, 3600)
        return {
          url: data?.signedUrl ?? '',
          name: att.file_name,
          type: att.content_type ?? 'application/octet-stream',
        }
      })
    )
    setLightbox({ urls, index: clickedIndex })
  }

  return (
    <>
      {lightbox && (
        <Lightbox
          attachments={lightbox.urls}
          index={lightbox.index}
          onClose={() => setLightbox(null)}
        />
      )}

      <div {...dropProps} className="rounded-xl transition-all" style={dragOver ? { outline: '2px dashed var(--brand)', outlineOffset: 4, background: 'var(--brand-light)' } : undefined}>
        <div className="flex items-center justify-between mb-3">
          <label className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
            Attachments{attachments.length > 0 && <span style={{ color: 'var(--text-muted)' }}> ({attachments.length})</span>}
          </label>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => cameraRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-1 text-xs font-medium disabled:opacity-50"
              style={{ color: 'var(--text-muted)' }}
            >
              <Camera className="w-3.5 h-3.5" />
              Camera
            </button>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-1.5 text-xs font-medium disabled:opacity-50"
              style={{ color: 'var(--brand)' }}
            >
              {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Paperclip className="w-3.5 h-3.5" />}
              {uploading ? 'Uploading…' : 'Attach'}
            </button>
          </div>
          <input ref={inputRef} type="file" multiple accept="image/*,.pdf" className="hidden" onChange={e => handleFiles(e.target.files)} />
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => handleFiles(e.target.files)} />
        </div>

        {error && <p className="text-xs  mb-2">{error}</p>}

        {attachments.length > 0 && (
          <div className="space-y-2">
            {attachments.map((att, i) => (
              <div
                key={att.id}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5"
                style={{ backgroundColor: 'var(--surface-2)' }}
              >
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                  style={{ backgroundColor: att.content_type?.startsWith('image/') ? '#DBEAFE' : '#FEE2E2' }}
                >
                  {att.content_type?.startsWith('image/') ? (
                    <ZoomIn className="w-4 h-4 text-[var(--transfer)]" />
                  ) : (
                    <FileText className="w-4 h-4 " />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{att.file_name}</p>
                  {att.file_size && (
                    <p className="text-xs" style={{ color: 'var(--text-faint)' }}>
                      {att.file_size >= 1024 * 1024
                        ? `${(att.file_size / 1024 / 1024).toFixed(1)} MB`
                        : `${(att.file_size / 1024).toFixed(0)} KB`}
                    </p>
                  )}
                </div>

                <button
                  onClick={() => openLightbox(i)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center tap-scale"
                  style={{ color: 'var(--brand)', backgroundColor: 'var(--brand-light)' }}
                  title="Preview / Download"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>

                <button
                  onClick={() => handleDelete(att)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center tap-scale"
                  style={{ color: 'var(--text-faint)' }}
                  title="Delete"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {attachments.length === 0 && !uploading && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => cameraRef.current?.click()}
              className="flex-1 border-2 border-dashed rounded-xl py-3 text-xs font-medium flex items-center justify-center gap-1.5"
              style={{ borderColor: 'var(--border)', color: 'var(--text-faint)' }}
            >
              <Camera className="w-3.5 h-3.5" />
              Take Photo
            </button>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="flex-1 border-2 border-dashed rounded-xl py-3 text-xs font-medium flex items-center justify-center gap-1.5"
              style={{ borderColor: dragOver ? 'var(--brand)' : 'var(--border)', color: dragOver ? 'var(--brand)' : 'var(--text-faint)' }}
            >
              <Paperclip className="w-3.5 h-3.5" />
              {dragOver ? 'Drop to attach' : 'Attach or drop file'}
            </button>
          </div>
        )}
      </div>
    </>
  )
}
