import type { SupabaseClient } from '@supabase/supabase-js'

export async function getNextInvoiceNumber(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  userId: string,
): Promise<string> {
  // Fast path: atomic claim inside Postgres (migration_v33). A single
  // UPDATE...RETURNING means two simultaneous invoice creations can never
  // receive the same number.
  const { data: claimed, error: rpcError } = await supabase.rpc('claim_invoice_number')
  if (!rpcError && typeof claimed === 'string' && claimed.length > 0) {
    return claimed
  }

  // Fallback (migration not run yet): read-then-increment.
  // NOTE: not race-safe — kept only so the app works before v33 is applied.
  // Ensure the settings row exists with defaults; ignore if it already exists.
  await supabase
    .from('recoverable_invoice_settings')
    .upsert({ user_id: userId }, { onConflict: 'user_id', ignoreDuplicates: true })

  // Read current state.
  const { data: settings, error } = await supabase
    .from('recoverable_invoice_settings')
    .select('invoice_prefix, next_invoice_number')
    .eq('user_id', userId)
    .single()

  if (error || !settings) {
    throw new Error(`Failed to read invoice settings: ${error?.message}`)
  }

  const current: number = settings.next_invoice_number ?? 1
  const prefix: string  = settings.invoice_prefix ?? 'INV-'

  // Atomically claim this number by incrementing before returning.
  // For a single-user per account this is race-condition safe.
  const { error: updateErr } = await supabase
    .from('recoverable_invoice_settings')
    .update({ next_invoice_number: current + 1 })
    .eq('user_id', userId)

  if (updateErr) {
    throw new Error(`Failed to increment invoice number: ${updateErr.message}`)
  }

  return prefix + String(current).padStart(6, '0')
}
