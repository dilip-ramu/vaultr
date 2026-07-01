import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

/** Old sidebar URL; content moved to /organization/employees as part of
 *  the Companies + Employees unification (v66). Redirect keeps bookmarks
 *  and any deep links working. */
export default function StaffRedirect() {
  redirect('/organization/employees')
}
