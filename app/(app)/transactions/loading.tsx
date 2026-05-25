export default function TransactionsLoading() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-6 animate-pulse">
      <div className="h-6 w-32 bg-gray-200 rounded-lg mb-5" />
      <div className="flex gap-3 mb-4">
        <div className="flex-1 h-12 bg-gray-200 rounded-xl" />
        <div className="flex-1 h-12 bg-gray-200 rounded-xl" />
      </div>
      <div className="h-10 bg-gray-200 rounded-xl mb-3" />
      <div className="flex gap-2 mb-4">
        {[0, 1, 2, 3].map(i => <div key={i} className="w-20 h-8 bg-gray-200 rounded-xl" />)}
      </div>
      <div className="space-y-4">
        {[0, 1, 2].map(i => (
          <div key={i}>
            <div className="h-4 w-20 bg-gray-200 rounded mb-2" />
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              {[0, 1, 2].map(j => <div key={j} className="h-16 bg-gray-100 m-2 rounded-xl" />)}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
