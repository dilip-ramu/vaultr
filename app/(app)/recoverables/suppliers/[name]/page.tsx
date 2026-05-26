import { redirect } from 'next/navigation'

export default async function SupplierLedgerRedirect({
  params,
}: {
  params: Promise<{ name: string }>
}) {
  const { name } = await params
  redirect(`/recoverables/customers/${name}`)
}
