import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import SignatoriesManager from '@/components/company-details/SignatoriesManager'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Authorised signatories — Vaultr' }

export default async function SignatoryTemplatesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: companies } = await supabase.from('companies')
    .select('id, name, business_type').eq('user_id', user.id)
    .order('is_default', { ascending: false }).order('name')

  const rows = (companies ?? []).map(c => ({
    id: c.id as string,
    name: c.name as string,
    businessType: ((c.business_type as string | null) === 'partnership' ? 'partnership' : 'proprietorship') as 'proprietorship' | 'partnership',
  }))

  return (
    <div className="w-full px-4 md:px-8 py-6">
      <div className="mb-5">
        <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: 'var(--text)' }}>Authorised signatories</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
          The proprietor or partners of each company, with their signature image. Pick who signed when you create a document — their signature prints on the PDF.
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Add a company first.</p>
      ) : (
        <div className="space-y-5">
          {rows.map(c => (
            <div key={c.id} className="rounded-2xl border p-4" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
              <div className="flex items-center gap-2 mb-3">
                <p className="font-bold" style={{ color: 'var(--text)' }}>{c.name}</p>
                <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded capitalize"
                  style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}>{c.businessType}</span>
              </div>
              <SignatoriesManager companyId={c.id} businessType={c.businessType} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
