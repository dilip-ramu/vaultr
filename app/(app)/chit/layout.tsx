// Everything under /chit gets the same row of tabs.
//
// Putting it here rather than in each page means a new chit page cannot forget
// it, and the tabs cannot drift out of step between pages.

import { resolveChitAccess } from '@/lib/chit/access'
import ChitTabs from '@/components/chit/ChitTabs'

export default async function ChitLayout({ children }: { children: React.ReactNode }) {
  // Not a gate — the pages and the database each do their own checking. This
  // only decides whether the Admins tab is worth showing.
  const access = await resolveChitAccess()

  return (
    <>
      <ChitTabs isOwner={access?.isOwner ?? false} />
      {children}
    </>
  )
}
