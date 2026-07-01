import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

/** Currencies moved into Setup. Redirect keeps old links alive. */
export default function CurrenciesRedirect() {
  redirect('/setup/currencies')
}
