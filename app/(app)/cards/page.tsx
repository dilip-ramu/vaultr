import { createClient } from '@/lib/supabase/server'
import CardsClient from '@/components/cards/CardsClient'
import type { CardTxn } from '@/lib/cards'

export const dynamic = 'force-dynamic'

export default async function CardsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const uid = user!.id

  const { data: cards } = await supabase
    .from('accounts')
    .select('id, name, color, avatar_url, initial_balance, statement_day, statement_due_day')
    .eq('user_id', uid)
    .eq('type', 'credit')
    .eq('is_active', true)
    .order('name')

  const cardIds = (cards ?? []).map(c => c.id)

  let txns: CardTxn[] = []
  let statements: { account_id: string; statement_date: string; bank_amount: number }[] = []

  if (cardIds.length > 0) {
    const since = new Date()
    since.setMonth(since.getMonth() - 14)
    const sinceStr = since.toISOString().split('T')[0]
    const idList = cardIds.join(',')

    const [{ data: t }, { data: s }] = await Promise.all([
      supabase
        .from('transactions')
        .select('account_id, to_account_id, type, amount, date')
        .eq('user_id', uid)
        .gte('date', sinceStr)
        .or(`account_id.in.(${idList}),to_account_id.in.(${idList})`),
      supabase
        .from('card_statements')
        .select('account_id, statement_date, bank_amount')
        .eq('user_id', uid),
    ])
    txns = (t ?? []) as CardTxn[]
    statements = s ?? []
  }

  return (
    <CardsClient
      cards={cards ?? []}
      txns={txns}
      statements={statements}
    />
  )
}
