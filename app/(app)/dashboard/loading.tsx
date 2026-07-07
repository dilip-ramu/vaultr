import { SkeletonCard, SkeletonList, SkeletonStat } from '@/components/shared/SkeletonCard'

export default function DashboardLoading() {
  return (
    <div className="page-enter w-full px-4 py-6 space-y-5">
      <div className="space-y-1.5">
        <div className="skeleton h-2.5 w-24" />
        <div className="skeleton h-6 w-40" />
      </div>
      <SkeletonCard height="120px" />
      <div className="grid grid-cols-3 gap-3">
        <SkeletonStat /><SkeletonStat /><SkeletonStat />
      </div>
      <SkeletonCard height="210px" />
      <div className="flex gap-3 overflow-hidden pb-1">
        {[0, 1, 2].map(i => (
          <div key={i} className="skeleton shrink-0" style={{ width: 160, height: 96, borderRadius: 'var(--radius-lg)' }} />
        ))}
      </div>
      <SkeletonList count={5} />
    </div>
  )
}
