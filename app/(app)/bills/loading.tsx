export default function BillsLoading() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-6 animate-pulse">
      <div className="h-6 w-24 bg-gray-200 rounded-lg mb-5" />
      <div className="space-y-3">
        {[0, 1, 2, 3, 4].map(i => <div key={i} className="h-20 bg-gray-200 rounded-2xl" />)}
      </div>
    </div>
  )
}
