import { SkeletonCard } from '@/components/shared/SkeletonCard'

export default function SubscriptionsLoading() {
  return (
    <div className="page-enter w-full px-4 py-6 space-y-4">
      <div className="skeleton h-6 w-32" />
      <div className="flex gap-3 overflow-x-auto pb-1">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="skeleton shrink-0" style={{ width: 120, height: 80, borderRadius: 'var(--radius-lg)' }} />
        ))}
      </div>
      <SkeletonCard height="72px" />
      <div className="space-y-3">
        {[0, 1, 2, 3, 4].map(i => <SkeletonCard key={i} height="72px" />)}
      </div>
    </div>
  )
}
