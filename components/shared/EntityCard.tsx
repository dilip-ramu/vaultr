import type { ReactNode } from 'react'
import CardGlass from './CardGlass'
import { cardFaceGradient } from '@/lib/card-gradient'

/**
 * The Accounts-style directory card: a coloured "30a" gradient identity face
 * on the left and a flexible info panel on the right. Shared by the customer,
 * supplier, company and employee directories so they stay visually identical.
 *
 * `faceTop` / `faceBottom` are the two rows of the coloured face (they sit
 * above the glass automatically). `children` is the right-hand info panel.
 */
export default function EntityCard({
  color, onClick, faceTop, faceBottom, children, faceClassName = 'sm:w-[280px]',
}: {
  color: string
  onClick?: () => void
  faceTop: ReactNode
  faceBottom: ReactNode
  children: ReactNode
  faceClassName?: string
}) {
  return (
    <div
      onClick={onClick}
      className={`h-full rounded-2xl overflow-hidden flex flex-col sm:flex-row transition-shadow hover:brightness-[0.99] ${onClick ? 'cursor-pointer' : ''}`}
      style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-lg)' }}
    >
      {/* coloured identity face — matches the Accounts card exactly */}
      <div className={`${faceClassName} shrink-0 p-5 flex flex-col justify-between gap-5 relative overflow-hidden`} style={{ background: cardFaceGradient(color), minHeight: '192px' }}>
        <CardGlass base={color} />
        <div className="flex items-start justify-between relative z-[1]">{faceTop}</div>
        <div className="relative z-[1]">{faceBottom}</div>
      </div>
      {/* info panel */}
      <div className="flex-1 p-5 flex flex-col min-w-0">{children}</div>
    </div>
  )
}

/** Small helper for the label/value stack used on the coloured face. */
export function FaceField({ label, value, align = 'left' }: { label: string; value: string; align?: 'left' | 'right' }) {
  return (
    <div className={align === 'right' ? 'text-right' : ''}>
      <p className="text-[8.5px] font-semibold uppercase tracking-wide" style={{ color: 'rgba(255,255,255,0.5)' }}>{label}</p>
      <p className="text-[12px] font-bold truncate" style={{ color: '#fff' }}>{value}</p>
    </div>
  )
}
