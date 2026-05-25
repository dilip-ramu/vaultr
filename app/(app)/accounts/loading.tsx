import { SkeletonCard } from '@/components/shared/SkeletonCard'

export default function AccountsLoading() {
  return (
    <div className="page-enter max-w-2xl mx-auto px-4 py-6 space-y-5">
      <div className="skeleton h-6 w-28" />
      <SkeletonCard height="80px" />
      <div className="space-y-3">
        {[0, 1, 2, 3].map(i => <SkeletonCard key={i} height="72px" />)}
      </div>
    </div>
  )
}
