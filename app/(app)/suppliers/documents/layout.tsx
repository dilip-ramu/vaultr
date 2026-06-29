import DocumentsTabs from '@/components/suppliers/documents/DocumentsTabs'

export default function SupplierDocumentsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>Documents</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
          Documents received from supplier emails, plus the inbox connection that fetches them
        </p>
      </div>
      <DocumentsTabs />
      <div>{children}</div>
    </div>
  )
}
