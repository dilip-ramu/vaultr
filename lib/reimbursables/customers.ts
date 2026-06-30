import type { SupabaseClient } from '@supabase/supabase-js'

export interface ReimbursableCustomer {
  id: string
  name: string
  payee_id: string | null
}

// Customers a user can issue reimbursable invoices to = customers that have at
// least one payee linked. Returns them ordered by name with the linked payee
// id eagerly attached so callers don't have to do a second lookup.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getReimbursableCustomers(supabase: SupabaseClient<any, any, any>, userId: string): Promise<ReimbursableCustomer[]> {
  // Pull every payee that points at a customer for this user, plus the
  // customer's name. One round-trip.
  const { data } = await supabase
    .from('payees')
    .select('id, customer_id, customer:customers(id, name)')
    .eq('user_id', userId)
    .not('customer_id', 'is', null)

  const list: ReimbursableCustomer[] = []
  const seen = new Set<string>()
  // Supabase types embedded relations as arrays; flatten to a single object.
  type Row = { id: string; customer_id: string; customer: { id: string; name: string } | { id: string; name: string }[] | null }
  for (const row of (data ?? []) as unknown as Row[]) {
    const cust = Array.isArray(row.customer) ? row.customer[0] : row.customer
    if (!cust) continue
    if (seen.has(cust.id)) continue
    seen.add(cust.id)
    list.push({ id: cust.id, name: cust.name, payee_id: row.id })
  }
  list.sort((a, b) => a.name.localeCompare(b.name))
  return list
}

/** Resolve the active customer from a URL param + the list. Falls back to
 *  the first one when nothing is selected (or selection is invalid). */
export function resolveActiveCustomer(
  customers: ReimbursableCustomer[],
  paramId: string | null,
): ReimbursableCustomer | null {
  if (customers.length === 0) return null
  if (paramId) {
    const match = customers.find(c => c.id === paramId)
    if (match) return match
  }
  return customers[0]
}

/** All payee IDs that point at a customer for this user — i.e. the payees
 *  whose transactions are reimbursable. Used by Budgets / Insights / Payee
 *  Rings to exclude reimbursable spending from "your" totals. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getBillablePayeeIds(supabase: SupabaseClient<any, any, any>, userId: string): Promise<string[]> {
  const { data } = await supabase
    .from('payees')
    .select('id')
    .eq('user_id', userId)
    .not('customer_id', 'is', null)
  return (data ?? []).map((r: { id: string }) => r.id)
}
