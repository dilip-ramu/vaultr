import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

/** Reconcile lives on the Accounts page now — see comment in
 *  /reconcile/page.tsx. Kept as a redirect for old Setup-tab links. */
export default function SetupReconcileRedirect() {
  redirect('/accounts')
}
