import { createClient } from '@/lib/supabase/server'
import SettingsClient from '@/components/settings/SettingsClient'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user!.id)
    .single()

  // Get household members if household exists
  let household = null
  let members: { id: string; full_name: string | null; nickname: string | null; avatar_url: string | null; email?: string }[] = []

  if (profile?.household_id) {
    const { data: hh } = await supabase
      .from('households')
      .select('*')
      .eq('id', profile.household_id)
      .single()
    household = hh

    const { data: memberProfiles } = await supabase
      .from('profiles')
      .select('id, full_name, nickname, avatar_url')
      .eq('household_id', profile.household_id)

    members = memberProfiles ?? []
  }

  return (
    <SettingsClient
      user={user!}
      profile={profile}
      household={household}
      members={members}
    />
  )
}
