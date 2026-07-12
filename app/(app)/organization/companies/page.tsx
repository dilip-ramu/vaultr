import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Company view — Vaultr' }

/**
 * The Company view tab. There's nothing to show at this level — a balance sheet
 * belongs to ONE company — so land on the default company and let the picker on
 * that page switch. Only if there are no companies at all does this render.
 */
export default async function CompanyViewIndex() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data } = await supabase
    .from('companies')
    .select('id')
    .eq('user_id', user.id)
    .order('is_default', { ascending: false })
    .order('name')
    .limit(1)
    .maybeSingle()

  const id = (data as { id: string } | null)?.id
  if (id) redirect(`/organization/companies/${id}`)

  return (
    <div className="w-full px-4 md:px-8 py-6">
      <div className="rounded-2xl border p-8 text-center" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
        <p className="text-sm font-bold" style={{ color: 'var(--text)' }}>No companies yet</p>
        <p className="text-[13px] mt-1" style={{ color: 'var(--text-muted)' }}>
          Add a company and its balance sheet — cash, assets, debt, receivables and payables — shows up here.
        </p>
        <Link href="/organization" className="inline-block mt-3 text-sm font-bold" style={{ color: 'var(--brand)' }}>
          Add a company →
        </Link>
      </div>
    </div>
  )
}
