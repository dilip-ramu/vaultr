import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

/** /setup used to render the Company tab. Company moved to
 *  /organization (Deploy v66) — Setup is now just app config. Land on
 *  the Email tab so the URL still resolves. */
export default function SetupRedirect() {
  redirect('/setup/settings')
}
