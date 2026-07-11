import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import GstReturnsClient from '@/components/gst/GstReturnsClient'
import { buildGstr1, buildGstr3b } from '@/lib/gst/returns'
import { collectOutward, collectInward, toGstCompany } from '@/lib/gst/collect'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'GST returns — Vaultr' }

type Props = { searchParams: Promise<{ company?: string; month?: string }> }

export default async function GstReturnsPage({ searchParams }: Props) {
  const { company: companyParam, month: monthParam } = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: companies } = await supabase.from('companies')
    .select('id, name, gstin, address').eq('user_id', user.id)
    .order('is_default', { ascending: false }).order('name')

  const list = (companies ?? []) as Record<string, unknown>[]
  const companyOpts = list.map(c => ({ id: c.id as string, name: c.name as string, gstin: (c.gstin as string | null) ?? null }))

  // Default to the previous month — the one you'd actually be filing.
  const now = new Date()
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const defaultMonth = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`

  const month = monthParam ?? defaultMonth
  const companyId = companyParam ?? (companyOpts[0]?.id ?? '')
  const row = list.find(c => c.id === companyId)

  if (!row) {
    return (
      <GstReturnsClient
        companies={companyOpts} companyId="" month={month}
        gstr1={null} gstr3b={null} inwardCount={0} unbrokenBills={0}
      />
    )
  }

  const company = toGstCompany(row)
  const [outward, inward] = await Promise.all([
    collectOutward(supabase, user.id, companyId, month),
    collectInward(supabase, user.id, companyId, month),
  ])

  const gstr1 = buildGstr1(outward, company, month)
  const gstr3b = buildGstr3b(outward, inward, company, month)
  const unbrokenBills = inward.filter(b => b.taxable + b.igst + b.cgst + b.sgst === 0).length

  return (
    <GstReturnsClient
      companies={companyOpts}
      companyId={companyId}
      month={month}
      gstr1={gstr1}
      gstr3b={gstr3b}
      inwardCount={inward.length}
      unbrokenBills={unbrokenBills}
    />
  )
}
