import type { CourierProvider } from '@/lib/logistics/types'

const PROVIDER_CONFIG: Record<CourierProvider, { label: string; bg: string; color: string }> = {
  DHL:    { label: 'DHL',    bg: '#FEF3C7', color: '#92400E' },
  FedEx:  { label: 'FedEx', bg: '#EDE9FE', color: '#5B21B6' },
  Aramex: { label: 'Aramex', bg: '#FFEDD5', color: '#9A3412' },
  UPS:    { label: 'UPS',   bg: '#FEF3E2', color: '#7C3109' },
  custom: { label: 'Custom', bg: 'var(--surface-2)', color: 'var(--text-muted)' },
}

interface Props {
  provider: CourierProvider | string
  size?: 'sm' | 'md'
}

export default function CourierProviderBadge({ provider, size = 'md' }: Props) {
  const config = PROVIDER_CONFIG[provider as CourierProvider] ?? {
    label: provider,
    bg: 'var(--surface-2)',
    color: 'var(--text-muted)',
  }
  const px = size === 'sm' ? '6px' : '10px'
  const py = size === 'sm' ? '2px' : '4px'
  const fontSize = size === 'sm' ? '10px' : '11px'

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: `${py} ${px}`,
        borderRadius: 6,
        fontSize,
        fontWeight: 700,
        letterSpacing: '0.04em',
        backgroundColor: config.bg,
        color: config.color,
        whiteSpace: 'nowrap',
      }}
    >
      {config.label}
    </span>
  )
}
