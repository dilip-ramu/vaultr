import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

/** Downloads (backup/export) is now the Export & Backup tab in Setup. */
export default function DownloadsRedirect() {
  redirect('/setup/export')
}
