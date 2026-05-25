export default function AccountsLoading() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-6 animate-pulse">
      <div className="h-6 w-28 bg-gray-200 rounded-lg mb-6" />
      <div className="h-28 bg-gray-200 rounded-2xl mb-6" />
      <div className="space-y-2">
        {[0, 1, 2, 3].map(i => <div key={i} className="h-16 bg-gray-200 rounded-2xl" />)}
      </div>
    </div>
  )
}
