import { SkeletonList } from '@/components/shared/SkeletonCard'

export default function BillsLoading() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
      <div className="skeleton h-6 w-24" />
      <SkeletonList count={5} />
    </div>
  )
}
