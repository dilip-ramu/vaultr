import { notFound } from 'next/navigation'
import { FileText } from 'lucide-react'
import { templateFormat } from '@/lib/documents/templateFormats'

export const dynamic = 'force-dynamic'

export default async function TemplateFormatPage({ params }: { params: Promise<{ format: string }> }) {
  const { format } = await params
  const fmt = templateFormat(format)
  if (!fmt || format === 'cheque') notFound()   // cheque has its own page

  return (
    <div className="w-full px-4 md:px-8 py-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: 'var(--text)' }}>{fmt.label} template</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>Per-company template for {fmt.label.toLowerCase()}s.</p>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border p-10 text-center" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
        <FileText className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
        <p className="font-semibold" style={{ color: 'var(--text)' }}>{fmt.label} uses the built-in design for now</p>
        <p className="text-sm mt-1 max-w-md mx-auto" style={{ color: 'var(--text-faint)' }}>
          A fully editable, per-company designer for this format will live here. For now every {fmt.label.toLowerCase()}
          {' '}prints on the standard layout with your company&apos;s accent, logo and signatory.
        </p>
      </div>
    </div>
  )
}
