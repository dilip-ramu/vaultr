interface SupplierColumnBadgesProps {
  suppliers: string[]
}

export default function SupplierColumnBadges({ suppliers }: SupplierColumnBadgesProps) {
  if (suppliers.length === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
        Detected suppliers:
      </span>
      {suppliers.map(name => (
        <span
          key={name}
          className="px-2.5 py-1 rounded-full text-xs font-medium"
          style={{ backgroundColor: 'var(--brand-light)', color: 'var(--brand)' }}
        >
          {name}
        </span>
      ))}
    </div>
  )
}
