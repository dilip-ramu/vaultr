import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import DownloadsClient from '@/components/downloads/DownloadsClient'

export const dynamic = 'force-dynamic'

export default async function SetupExportTabPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <DownloadsClient />
    </div>
  )
}
