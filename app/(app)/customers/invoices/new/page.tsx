import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

/** Was the typed invoice page. Now the Plain invoice flow.
 *  Kept as a redirect so bookmarks and old links still land somewhere useful. */
export default async function TypedInvoiceRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const sp = await searchParams
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(sp)) if (v) qs.set(k, v)
  const extra = qs.toString()
  redirect(`/customers/invoices/direct${extra ? ('/customers/invoices/direct'.includes('?') ? '&' : '?') + extra : ''}`)
}
