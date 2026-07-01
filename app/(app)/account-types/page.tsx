import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

/** Account types is a Setup tab now; this stub keeps old bookmarks and iOS
 *  home-screen shortcuts working. Same story as /reconcile. */
export default function AccountTypesRedirect() {
  redirect('/setup/account-types')
}
