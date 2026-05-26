import type { AllocationStatus, BatchStatus } from '@/lib/recoverables/types'

const STYLES: Record<string, { bg: string; text: string; label: string }> = {
  pending:   { bg: 'var(--status-pending-bg, #fef9c3)',   text: 'var(--status-pending-text, #a16207)',   label: 'Pending' },
  billed:    { bg: 'var(--status-partial-bg, #dbeafe)',   text: 'var(--status-partial-text, #1d4ed8)',   label: 'Billed' },
  paid:      { bg: 'var(--status-paid-bg, #dcfce7)',      text: 'var(--status-paid-text, #15803d)',      label: 'Paid' },
  processed: { bg: 'var(--status-paid-bg, #dcfce7)',      text: 'var(--status-paid-text, #15803d)',      label: 'Processed' },
  failed:    { bg: 'var(--status-cancelled-bg, #fee2e2)', text: 'var(--status-cancelled-text, #b91c1c)', label: 'Failed' },
  cancelled: { bg: 'var(--status-cancelled-bg, #fee2e2)', text: 'var(--status-cancelled-text, #b91c1c)', label: 'Cancelled' },
}

interface StatusBadgeProps {
  status: AllocationStatus | BatchStatus | string
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  const s = STYLES[status] ?? STYLES.pending
  return (
    <span
      className="px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap"
      style={{ backgroundColor: s.bg, color: s.text }}
    >
      {s.label}
    </span>
  )
}
