import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

/** Reconcile is now folded into the Accounts page — every account card has an
 *  inline "Log Reconciliation" panel behind the scale icon. This route stays
 *  around only so old bookmarks and links don't 404. */
export default function ReconcileRedirect() {
  redirect('/accounts')
}
