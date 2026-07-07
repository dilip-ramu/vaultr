import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

/** Settings moved into the Setup hub (Setup → Settings). This URL still
 *  resolves for any old links / bookmarks. */
export default function SettingsRedirect() {
  redirect('/setup/settings')
}
