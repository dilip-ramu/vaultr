'use client'

// Route-level error boundary: catches any crash on the commission page
// and shows the actual error message instead of the generic
// "This page couldn't load" screen.
export default function CommissionError({ error, reset }: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="max-w-xl mx-auto px-4 py-16 text-center">
      <p className="text-red-500 font-semibold mb-2">Commission page error</p>
      <p className="text-sm font-mono bg-red-50 text-red-700 rounded-xl px-4 py-3 break-all mb-4">
        {error.message || 'Unknown error'}{error.digest ? ` (digest: ${error.digest})` : ''}
      </p>
      <button
        onClick={reset}
        className="px-4 py-2 rounded-xl text-sm font-semibold text-white"
        style={{ background: 'var(--brand)' }}
      >
        Try again
      </button>
    </div>
  )
}
