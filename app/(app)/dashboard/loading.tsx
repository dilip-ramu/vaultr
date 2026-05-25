export default function DashboardLoading() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-5 animate-pulse">
      <div className="h-6 w-32 bg-gray-200 rounded-lg" />
      <div className="h-40 bg-gray-200 rounded-2xl" />
      <div className="grid grid-cols-3 gap-3">
        {[0, 1, 2].map(i => <div key={i} className="h-20 bg-gray-200 rounded-2xl" />)}
      </div>
      <div className="h-48 bg-gray-200 rounded-2xl" />
      <div className="space-y-2">
        {[0, 1, 2, 3].map(i => <div key={i} className="h-16 bg-gray-200 rounded-2xl" />)}
      </div>
    </div>
  )
}
