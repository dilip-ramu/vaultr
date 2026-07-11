import { createClient } from '@/lib/supabase/server'
import BanksClient from '@/components/setup/banks/BanksClient'
import type { Bank } from '@/lib/cheque/types'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Cheque templates — Vaultr' }

export default async function ChequeTemplatesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: banks }, { data: accounts }] = await Promise.all([
    supabase.from('banks').select('*').eq('user_id', user!.id).order('name'),
    supabase.from('accounts').select('id, name, bank_id').eq('user_id', user!.id).eq('is_active', true),
  ])

  const bgUrls: Record<string, string> = {}
  for (const b of (banks ?? []) as Bank[]) {
    if (b.cheque_bg_path) {
      const { data: { publicUrl } } = supabase.storage.from('vaultr-avatars').getPublicUrl(b.cheque_bg_path)
      if (publicUrl) bgUrls[b.id] = `${publicUrl}?v=${b.updated_at ? Date.parse(b.updated_at) : ''}`
    }
  }

  const accountCount: Record<string, number> = {}
  for (const a of (accounts ?? []) as { id: string; bank_id: string | null }[]) {
    if (a.bank_id) accountCount[a.bank_id] = (accountCount[a.bank_id] ?? 0) + 1
  }

  return <BanksClient initialBanks={(banks ?? []) as Bank[]} bgUrls={bgUrls} accountCount={accountCount} />
}
