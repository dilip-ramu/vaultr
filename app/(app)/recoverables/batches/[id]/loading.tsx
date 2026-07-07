export default function BatchDetailLoading() {
  return (
    <div className="page-enter w-full px-4 py-6 space-y-6">
      {/* Back + title */}
      <div className="flex items-center gap-3">
        <div className="skeleton w-9 h-9 rounded-xl" />
        <div className="skeleton h-6 w-48" />
      </div>

      {/* Header card */}
      <div className="card space-y-4">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <div className="skeleton h-5 w-40" />
            <div className="skeleton h-3 w-24" />
          </div>
          <div className="skeleton h-6 w-20 rounded-full" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="space-y-1">
              <div className="skeleton h-5 w-12" />
              <div className="skeleton h-3 w-16" />
            </div>
          ))}
        </div>
      </div>

      {/* Supplier table */}
      <div className="card space-y-3">
        <div className="skeleton h-4 w-32" />
        {[...Array(3)].map((_, i) => (
          <div key={i} className="flex items-center gap-3 py-2">
            <div className="skeleton h-4 w-28 flex-1" />
            <div className="skeleton h-4 w-16" />
            <div className="skeleton h-4 w-20" />
            <div className="skeleton h-6 w-20 rounded-lg" />
          </div>
        ))}
      </div>

      {/* Shipment list */}
      <div className="space-y-2">
        <div className="skeleton h-4 w-36" />
        {[...Array(4)].map((_, i) => (
          <div key={i} className="card flex justify-between items-center">
            <div className="skeleton h-4 w-32" />
            <div className="skeleton h-4 w-20" />
          </div>
        ))}
      </div>
    </div>
  )
}
