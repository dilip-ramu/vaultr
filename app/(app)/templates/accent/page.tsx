import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AccentTemplatesClient from '@/components/templates/AccentTemplatesClient'
import { normalizeAccent } from '@/lib/companies/templates'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Accent colour — Vaultr' }

export default async function AccentTemplatesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: companies } = await supabase.from('companies')
    .select('id, name, invoice_accent').eq('user_id', user.id)
    .order('is_default', { ascending: false }).order('name')

  const rows = (companies ?? []).map(c => ({
    id: c.id as string,
    name: c.name as string,
    accent: normalizeAccent(c.invoice_accent as string | null),
  }))

  return (
    <div className="w-full px-4 md:px-8 py-6">
      <div className="mb-5">
        <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: 'var(--text)' }}>Accent colour</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
          One colour per company — it drives the top strip, titles and totals on every document, PDF and template.
        </p>
      </div>
      <AccentTemplatesClient initial={rows} />
    </div>
  )
}
