import { SkeletonCard, SkeletonList } from '@/components/shared/SkeletonCard'

export default function CourierInvoicesLoading() {
  return (
    <div className="page-enter max-w-2xl mx-auto px-4 py-6 space-y-5">
      <div className="flex items-center justify-between">
        <div className="space-y-1.5">
          <div className="skeleton h-5 w-36" />
          <div className="skeleton h-3 w-24" />
        </div>
        <div className="skeleton h-9 w-20 rounded-xl" />
      </div>
      <SkeletonList count={5} />
    </div>
  )
}
