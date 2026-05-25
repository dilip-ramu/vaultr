const lineWidths = ['75%', '60%', '82%', '55%', '70%', '88%', '65%', '78%']

export function SkeletonCard({ lines = 3, height }: { lines?: number; height?: string }) {
  return (
    <div
      className="p-4"
      style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)' }}
    >
      {height ? (
        <div className="skeleton w-full" style={{ height }} />
      ) : (
        <div className="space-y-2.5">
          {Array.from({ length: lines }).map((_, i) => (
            <div key={i} className="skeleton h-3" style={{ width: lineWidths[i % lineWidths.length] }} />
          ))}
        </div>
      )}
    </div>
  )
}

export function SkeletonList({ count = 5 }: { count?: number }) {
  return (
    <div
      className="overflow-hidden"
      style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)' }}
    >
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 px-4 py-3.5"
          style={{ borderBottom: i < count - 1 ? '1px solid var(--border-2)' : 'none' }}
        >
          <div className="skeleton w-10 h-10 shrink-0" style={{ borderRadius: 'var(--radius-md)' }} />
          <div className="flex-1 space-y-2">
            <div className="skeleton h-3" style={{ width: lineWidths[i % lineWidths.length] }} />
            <div className="skeleton h-2.5 w-1/3" />
          </div>
          <div className="skeleton h-4 w-16 shrink-0" />
        </div>
      ))}
    </div>
  )
}

export function SkeletonStat() {
  return (
    <div
      className="p-3.5"
      style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)' }}
    >
      <div className="skeleton h-2.5 w-14 mb-2.5" />
      <div className="skeleton h-6 w-20 mb-1.5" />
      <div className="skeleton h-2 w-12" />
    </div>
  )
}
