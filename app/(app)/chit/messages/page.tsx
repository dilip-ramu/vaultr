// The message library — one set for every chit group.
//
// It is a page of its own rather than a panel inside a group, because the
// messages are not a property of a group. Four groups share them; editing them
// four times is how three of them end up saying something different.

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { resolveChitAccess, CAN } from '@/lib/chit/access'
import { fromRow } from '@/lib/chit/messageTemplates'
import MessageLibrary from '@/components/chit/MessageLibrary'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Chit messages — Inex' }

export default async function ChitMessagesPage() {
  const access = await resolveChitAccess()
  if (!access) redirect('/login')
  // The wording that reaches every member is a group-management act.
  if (!CAN.manageGroups(access.role)) redirect('/chit')

  const supabase = await createClient()
  const { data } = await supabase.from('chit_message_templates')
    .select('*').eq('user_id', access.ownerId)
    .order('sort_order', { ascending: true }).order('created_at', { ascending: true })

  return (
    <div className="w-full px-4 md:px-8 py-6 space-y-5">
      <div>
        <h1 className="text-xl md:text-2xl font-extrabold tracking-tight" style={{ color: 'var(--text)' }}>
          Chit messages
        </h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
          What members receive, written once and used by every group.
        </p>
      </div>

      <MessageLibrary
        saved={((data ?? []) as Record<string, unknown>[]).map(fromRow)}
        connected={Boolean(process.env.WHATSAPP_WABA_ID && process.env.WHATSAPP_TOKEN)}
      />
    </div>
  )
}
