'use client'

import Link from 'next/link'
import { Plus, type LucideIcon } from 'lucide-react'

/**
 * Shared empty-state card — frame 18e. Icon tile, title, subtext, optional CTA
 * (button via onAction, or a link via href).
 */
export default function EmptyState({
  icon: Icon,
  title,
  message,
  actionLabel,
  onAction,
  href,
  actionIcon: ActionIcon = Plus,
  className = '',
}: {
  icon: LucideIcon
  title: string
  message?: string
  actionLabel?: string
  onAction?: () => void
  href?: string
  actionIcon?: LucideIcon
  className?: string
}) {
  const cta = actionLabel && (
    <span className="mt-[18px] inline-flex items-center gap-[7px] rounded-[11px] px-[18px] py-[10px] text-[13px] font-bold text-white" style={{ background: 'var(--brand)' }}>
      <ActionIcon className="w-[15px] h-[15px]" /> {actionLabel}
    </span>
  )
  return (
    <div
      className={`w-full max-w-[360px] mx-auto rounded-[18px] px-[30px] py-[44px] text-center flex flex-col items-center ${className}`}
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
    >
      <div className="w-[66px] h-[66px] rounded-[20px] flex items-center justify-center mb-4" style={{ background: 'var(--brand-light)' }}>
        <Icon className="w-[30px] h-[30px]" style={{ color: 'var(--brand)' }} />
      </div>
      <p className="text-[16px] font-extrabold" style={{ color: 'var(--text)' }}>{title}</p>
      {message && (
        <p className="text-[13px] leading-[1.55] mt-[5px] max-w-[230px]" style={{ color: 'var(--text-muted)' }}>{message}</p>
      )}
      {actionLabel && (
        href
          ? <Link href={href}>{cta}</Link>
          : <button type="button" onClick={onAction}>{cta}</button>
      )}
    </div>
  )
}
