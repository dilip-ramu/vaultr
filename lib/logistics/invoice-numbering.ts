import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Calls the generate_supplier_invoice_number() SQL function and returns
 * a formatted string like "SI-2025-0001". Increments per-user per-year.
 */
export async function getNextSupplierInvoiceNumber(
  supabase: SupabaseClient,
  userId: string,
): Promise<string> {
  const { data, error } = await supabase.rpc('generate_supplier_invoice_number', {
    p_user_id: userId,
  })
  if (error) throw new Error(`Failed to generate invoice number: ${error.message}`)
  return data as string
}
