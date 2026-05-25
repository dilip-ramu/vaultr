export default function CategoriesLoading() {
  return (
    <div className="page-enter max-w-2xl mx-auto px-4 py-6 space-y-5">
      <div className="skeleton h-6 w-28" />
      <div className="skeleton h-10 w-full" />
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="skeleton h-24" style={{ borderRadius: 'var(--radius-lg)' }} />
        ))}
      </div>
    </div>
  )
}
