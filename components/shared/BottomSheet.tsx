'use client'

interface Props {
  isOpen: boolean
  onClose: () => void
  children: React.ReactNode
  title?: string
}

export default function BottomSheet({ isOpen, onClose, children, title }: Props) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center md:justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Sheet */}
      <div
        className="relative w-full md:max-w-md slide-up flex flex-col"
        style={{
          backgroundColor: 'var(--surface)',
          borderRadius: '24px 24px 0 0',
          maxHeight: '94dvh',
        }}
      >
        {/* Drag handle — mobile only */}
        <div className="flex justify-center pt-3 pb-1 md:hidden">
          <div className="w-10 h-1 rounded-full" style={{ backgroundColor: 'var(--border)' }} />
        </div>

        {title && (
          <div
            className="text-center px-5 py-3 text-sm font-semibold border-b"
            style={{ color: 'var(--text)', borderColor: 'var(--border)' }}
          >
            {title}
          </div>
        )}

        {children}
      </div>
    </div>
  )
}
