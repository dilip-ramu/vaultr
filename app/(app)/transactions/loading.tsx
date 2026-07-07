import { SkeletonList } from '@/components/shared/SkeletonCard'

export default function TransactionsLoading() {
  return (
    <div className="page-enter w-full px-4 py-6 space-y-4">
      <div className="skeleton h-6 w-32" />
      <div className="flex gap-3">
        <div className="skeleton flex-1 h-12" />
        <div className="skeleton flex-1 h-12" />
      </div>
      <div className="skeleton h-10 w-full" />
      <div className="flex gap-2">
        {[0, 1, 2, 3].map(i => <div key={i} className="skeleton w-20 h-8" />)}
      </div>
      <SkeletonList count={8} />
    </div>
  )
}
