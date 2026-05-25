import { SkeletonCard, SkeletonList } from '@/components/shared/SkeletonCard'

export default function LogisticsLoading() {
  return (
    <div className="page-enter max-w-2xl mx-auto px-4 py-6 space-y-5">
      <div className="flex justify-between items-center">
        <div className="space-y-1.5">
          <div className="skeleton h-6 w-24" />
          <div className="skeleton h-3 w-40" />
        </div>
        <div className="skeleton h-9 w-32 rounded-xl" />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <SkeletonCard height="72px" />
        <SkeletonCard height="72px" />
        <SkeletonCard height="72px" />
      </div>
      <SkeletonCard height="56px" />
      <SkeletonList count={3} />
    </div>
  )
}
