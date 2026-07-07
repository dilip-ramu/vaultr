export default function RecoverablesLoading() {
  return (
    <div className="page-enter w-full px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="skeleton h-7 w-36" />
        <div className="skeleton h-9 w-28 rounded-xl" />
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="card space-y-2">
            <div className="skeleton h-8 w-24" />
            <div className="skeleton h-3 w-16" />
          </div>
        ))}
      </div>

      {/* Supplier balances */}
      <div className="space-y-2">
        <div className="skeleton h-4 w-40" />
        <div className="card space-y-3 py-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="skeleton h-4 w-32" />
              <div className="flex-1 skeleton h-2 rounded-full" />
              <div className="skeleton h-4 w-20" />
            </div>
          ))}
        </div>
      </div>

      {/* Batch list */}
      <div className="space-y-2">
        <div className="skeleton h-4 w-32" />
        {[...Array(3)].map((_, i) => (
          <div key={i} className="card flex items-center justify-between gap-3">
            <div className="space-y-1.5 flex-1">
              <div className="skeleton h-4 w-40" />
              <div className="skeleton h-3 w-24" />
            </div>
            <div className="skeleton h-6 w-16 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  )
}
