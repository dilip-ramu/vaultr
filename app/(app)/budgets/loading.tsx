import { SkeletonCard } from '@/components/shared/SkeletonCard'

export default function BudgetsLoading() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
      <div className="skeleton h-6 w-24" />
      <SkeletonCard height="100px" />
      <div className="space-y-3">
        {[0, 1, 2, 3].map(i => <SkeletonCard key={i} height="88px" />)}
      </div>
    </div>
  )
}
