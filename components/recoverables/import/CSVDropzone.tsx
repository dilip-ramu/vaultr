'use client'

import { useRef, useState } from 'react'
import { FileSpreadsheet, Loader2 } from 'lucide-react'

interface CSVDropzoneProps {
  onFileSelect: (file: File) => void
  isLoading?: boolean
}

export default function CSVDropzone({ onFileSelect, isLoading }: CSVDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  const handleFile = (file: File | null | undefined) => {
    if (!file || isLoading) return
    if (!file.name.toLowerCase().endsWith('.csv')) return
    onFileSelect(file)
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    handleFile(e.dataTransfer.files[0])
  }

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    if (!isLoading) setDragOver(true)
  }

  return (
    <div
      onClick={() => !isLoading && inputRef.current?.click()}
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={() => setDragOver(false)}
      className="w-full rounded-2xl border-2 border-dashed flex flex-col items-center justify-center gap-3 cursor-pointer select-none transition-all"
      style={{
        minHeight: 180,
        borderColor: dragOver ? 'var(--brand)' : 'var(--border)',
        backgroundColor: dragOver ? 'var(--brand-light)' : 'var(--surface-2)',
        opacity: isLoading ? 0.6 : 1,
        cursor: isLoading ? 'default' : 'pointer',
      }}
    >
      {isLoading ? (
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--brand)' }} />
      ) : (
        <FileSpreadsheet className="w-8 h-8" style={{ color: dragOver ? 'var(--brand)' : 'var(--text-muted)' }} />
      )}

      <div className="text-center px-4">
        <p className="text-sm font-semibold" style={{ color: dragOver ? 'var(--brand)' : 'var(--text)' }}>
          {isLoading ? 'Analysing CSV…' : 'Drop your CSV here or tap to browse'}
        </p>
        {!isLoading && (
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
            Export from Apple Numbers or Excel as CSV
          </p>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={e => handleFile(e.target.files?.[0])}
      />
    </div>
  )
}
