import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

/** Older reimbursement builder address.
 *  Kept as a redirect so bookmarks and old links still land somewhere useful. */
export default async function OldReimbursementBuilderRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const sp = await searchParams
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(sp)) if (v) qs.set(k, v)
  const extra = qs.toString()
  redirect(`/customers/invoices/reimbursable?step=build${extra ? ('/customers/invoices/reimbursable?step=build'.includes('?') ? '&' : '?') + extra : ''}`)
}
