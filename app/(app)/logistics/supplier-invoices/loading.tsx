import { SkeletonCard, SkeletonList } from '@/components/shared/SkeletonCard'

export default function SupplierInvoicesLoading() {
  return (
    <div className="page-enter max-w-2xl mx-auto px-4 py-6 space-y-5">
      <div className="flex items-center justify-between">
        <div className="skeleton h-5 w-36" />
        <div className="skeleton h-3 w-20" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <SkeletonCard height="72px" />
        <SkeletonCard height="72px" />
      </div>
      <SkeletonList count={4} />
    </div>
  )
}
