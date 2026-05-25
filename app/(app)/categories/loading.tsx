export default function CategoriesLoading() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-6 animate-pulse">
      <div className="h-6 w-28 bg-gray-200 rounded-lg mb-5" />
      <div className="h-10 bg-gray-200 rounded-xl mb-5" />
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="h-24 bg-gray-200 rounded-2xl" />
        ))}
      </div>
    </div>
  )
}
