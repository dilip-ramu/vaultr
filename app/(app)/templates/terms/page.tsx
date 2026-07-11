import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import TermsClient from '@/components/templates/TermsClient'
import { TERMS_FORMATS, DEFAULT_TERMS } from '@/lib/documents/terms'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Terms & conditions — Vaultr' }

export default async function TermsTemplatesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Global (all-company) terms per format. Missing rows fall back to the
  // built-in default at print time, so an untouched format still reads well.
  let saved: Record<string, string> = {}
  const { data } = await supabase.from('document_terms')
    .select('format, terms').eq('user_id', user.id).is('company_id', null)
  for (const r of (data ?? []) as { format: string; terms: string | null }[]) saved[r.format] = r.terms ?? ''
  saved = saved ?? {}

  const rows = TERMS_FORMATS.map(f => ({
    slug: f.slug,
    label: f.label,
    hint: f.hint,
    terms: saved[f.slug] ?? '',
    fallback: DEFAULT_TERMS[f.slug] ?? '',
  }))

  return (
    <div className="w-full px-4 md:px-8 py-6">
      <div className="mb-5">
        <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: 'var(--text)' }}>Terms &amp; conditions</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
          One set of terms per document type, used on every company&apos;s PDF. Leave a box empty and the suggested wording below it is printed instead.
        </p>
      </div>
      <TermsClient initial={rows} />
    </div>
  )
}
