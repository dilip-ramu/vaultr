import { SkeletonCard } from '@/components/shared/SkeletonCard'

export default function InsightsLoading() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
      <div className="skeleton h-6 w-40" />
      <div className="skeleton h-4 w-24" />
      <div className="space-y-3 pt-2">
        {[0, 1, 2, 3, 4].map(i => <SkeletonCard key={i} height="80px" />)}
      </div>
      <SkeletonCard height="160px" />
    </div>
  )
}
