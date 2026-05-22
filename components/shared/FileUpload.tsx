'use client'

import { useState, useRef } from 'react'
import { Paperclip, X, FileText, Image, Loader2, ExternalLink, Camera } from 'lucide-react'
import type { Attachment } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'

interface Props {
  transactionId?: string
  billId?: string
  existingAttachments?: Attachment[]
  onAttachmentsChange?: (attachments: Attachment[]) => void
}

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
const MAX_SIZE = 10 * 1024 * 1024 // 10MB

export default function FileUpload({ transactionId, billId, existingAttachments = [], onAttachmentsChange }: Props) {
  const [attachments, setAttachments] = useState<Attachment[]>(existingAttachments)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)

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

      const ext = file.name.split('.').pop()
      const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

      const { error: uploadError } = await supabase.storage
        .from('vaultr-attachments')
        .upload(path, file, { contentType: file.type })

      if (uploadError) { setError(uploadError.message); continue }

      const { data: record } = await supabase.from('attachments').insert({
        user_id: user.id,
        transaction_id: transactionId ?? null,
        bill_id: billId ?? null,
        file_path: path,
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
    const supabase = createClient()
    await supabase.storage.from('vaultr-attachments').remove([attachment.file_path])
    await supabase.from('attachments').delete().eq('id', attachment.id)
    const updated = attachments.filter(a => a.id !== attachment.id)
    setAttachments(updated)
    onAttachmentsChange?.(updated)
  }

  const getUrl = async (path: string) => {
    const supabase = createClient()
    const { data } = await supabase.storage.from('vaultr-attachments').createSignedUrl(path, 3600)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-sm font-medium text-gray-700">Attachments</label>
        <div className="flex items-center gap-2">
          {/* Camera capture — shows on mobile, works on desktop too */}
          <button
            type="button"
            onClick={() => cameraRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-1 text-xs text-gray-500 font-medium hover:text-brand-500 disabled:opacity-50"
          >
            <Camera className="w-3.5 h-3.5" />
            Camera
          </button>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-1.5 text-xs text-brand-500 font-medium hover:text-brand-600 disabled:opacity-50"
          >
            {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Paperclip className="w-3.5 h-3.5" />}
            {uploading ? 'Uploading…' : 'Attach file'}
          </button>
        </div>
        {/* Regular file picker */}
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/*,.pdf"
          className="hidden"
          onChange={e => handleFiles(e.target.files)}
        />
        {/* Camera capture input — uses rear camera on mobile */}
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={e => handleFiles(e.target.files)}
        />
      </div>

      {error && <p className="text-xs text-red-500 mb-2">{error}</p>}

      {attachments.length > 0 && (
        <div className="space-y-1.5">
          {attachments.map(att => (
            <div key={att.id} className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2">
              {att.content_type?.startsWith('image/') ? (
                <Image className="w-4 h-4 text-blue-500 shrink-0" />
              ) : (
                <FileText className="w-4 h-4 text-red-500 shrink-0" />
              )}
              <span className="text-xs text-gray-700 flex-1 truncate">{att.file_name}</span>
              {att.file_size && (
                <span className="text-[10px] text-gray-400">{(att.file_size / 1024).toFixed(0)}KB</span>
              )}
              <button onClick={() => getUrl(att.file_path)} className="text-gray-400 hover:text-brand-500">
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => handleDelete(att)} className="text-gray-400 hover:text-red-500">
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
            className="flex-1 border-2 border-dashed border-gray-200 rounded-xl py-3 text-xs text-gray-400 hover:border-brand-300 hover:text-brand-400 transition-colors flex items-center justify-center gap-1.5"
          >
            <Camera className="w-3.5 h-3.5" />
            Take Photo
          </button>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex-1 border-2 border-dashed border-gray-200 rounded-xl py-3 text-xs text-gray-400 hover:border-brand-300 hover:text-brand-400 transition-colors flex items-center justify-center gap-1.5"
          >
            <Paperclip className="w-3.5 h-3.5" />
            Attach File
          </button>
        </div>
      )}
    </div>
  )
}
