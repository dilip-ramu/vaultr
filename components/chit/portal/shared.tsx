'use client'

// Shared bits for the member portal. Kept separate from the app's own shared
// components so a change made for the admin UI can never quietly alter what an
// external person sees.

export const inr = (n: number | null | undefined): string =>
  n == null ? '—' : '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN')

export const fmtDate = (d: string | null | undefined): string => {
  if (!d) return '—'
  const dt = new Date(d)
  return Number.isNaN(dt.getTime()) ? '—'
    : dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl ${className}`}
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      {children}
    </div>
  )
}

export function Row({ label, value, tone }: { label: string; value: React.ReactNode; tone?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <span className="text-[12.5px] shrink-0" style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span className="text-[13px] font-bold text-right"
        style={{ color: tone ?? 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  )
}

const STATUS: Record<string, { label: string; color: string }> = {
  PAID:    { label: 'Paid',    color: 'var(--income)' },
  PENDING: { label: 'Due',     color: 'var(--amber)' },
  OVERDUE: { label: 'Overdue', color: 'var(--expense)' },
}

export function StatusChip({ status }: { status: string }) {
  const s = STATUS[status] ?? { label: status, color: 'var(--text-faint)' }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide"
      style={{ color: s.color, background: `color-mix(in srgb, ${s.color} 14%, transparent)` }}>
      {s.label}
    </span>
  )
}

export function SignOut() {
  return (
    <button
      onClick={async () => {
        await fetch('/api/portal/logout', { method: 'POST' })
        window.location.href = '/m/closed'
      }}
      className="text-[12px] underline underline-offset-2"
      style={{ color: 'var(--text-faint)' }}
    >
      Sign out
    </button>
  )
}
