export default function ProfitabilityLoading() {
  return (
    <div className="page-enter w-full px-4 py-6 space-y-5">
      <div className="skeleton h-6 w-40" />
      <div className="skeleton h-12 w-full" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {[0, 1, 2].map(i => <div key={i} className="skeleton h-40" />)}
      </div>
      <div className="skeleton h-64 w-full" />
    </div>
  )
}
