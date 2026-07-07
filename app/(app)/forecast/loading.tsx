export default function ForecastLoading() {
  return (
    <div className="page-enter w-full px-4 py-6 space-y-5">
      <div className="skeleton h-6 w-40" />
      <div className="skeleton h-24 w-full" />
      {[0, 1, 2, 3].map(i => <div key={i} className="skeleton h-32 w-full" />)}
    </div>
  )
}
