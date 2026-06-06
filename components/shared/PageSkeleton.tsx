// Generic page loading skeleton — shown during route navigation so pages
// fade in instead of flashing blank. Purely visual; no data, no behaviour.
export default function PageSkeleton() {
  return (
    <div className="page-enter max-w-5xl mx-auto px-4 py-6 space-y-4">
      <div className="skeleton h-6 w-44" />
      <div className="skeleton h-4 w-64" />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
        {[0, 1, 2].map(i => <div key={i} className="skeleton h-24" />)}
      </div>
      <div className="space-y-2 pt-2">
        {[0, 1, 2, 3, 4].map(i => <div key={i} className="skeleton h-14 w-full" />)}
      </div>
    </div>
  )
}
