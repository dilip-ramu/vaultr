import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'

// ── Complete backup ──────────────────────────────────────────────────────────
// Dumps every user-owned table in full (no date filter) so the backup can fully
// reconstruct the account. Each table is fetched page-by-page to avoid the
// 1000-row cap. Tables that don't exist (migration not run) are skipped and
// noted in `errors` rather than failing the whole backup.

// Every user-data table. `profiles` is keyed by id (= the user), the rest by user_id.
const TABLES: { name: string; key?: string }[] = [
  { name: 'profiles', key: 'id' },
  { name: 'accounts' },
  { name: 'custom_account_types' },
  { name: 'builtin_account_type_overrides' },
  { name: 'categories' },
  { name: 'payees' },
  { name: 'transactions' },
  { name: 'attachments' },
  { name: 'activity_notes' },
  { name: 'bills' },
  { name: 'budgets' },
  { name: 'customers' },
  { name: 'suppliers' },
  { name: 'supplier_invoices' },
  { name: 'bulk_payment_batches' },
  { name: 'invoice_supplier_links' },
  { name: 'recoverable_invoices' },
  { name: 'recoverable_invoice_lines' },
  { name: 'recoverable_invoice_settings' },
  { name: 'recoverable_allocations' },
  { name: 'recoverable_import_batches' },
  { name: 'recoverable_shipments' },
  { name: 'recoverable_tds_entries' },
  { name: 'commission_orders' },
  { name: 'commission_styles' },
  { name: 'contrast_billing_categories' },
  { name: 'contrast_invoices' },
  { name: 'contrast_invoice_items' },
  { name: 'employees' },
  { name: 'payroll_months' },
  { name: 'payroll_entries' },
  { name: 'salary_slips' },
  { name: 'card_statements' },
  { name: 'currency_rates' },
  { name: 'email_integrations' },
  { name: 'email_documents' },
  { name: 'monitored_senders' },
]

async function fetchAll(
  supabase: SupabaseClient, table: string, key: string, uid: string,
): Promise<{ rows: unknown[]; error?: string }> {
  const rows: unknown[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .eq(key, uid)
      .range(from, from + 999)
    if (error) return { rows, error: error.message }
    rows.push(...(data ?? []))
    if (!data || data.length < 1000) break
  }
  return { rows }
}

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const uid = user.id

  const tables: Record<string, unknown[]> = {}
  const counts: Record<string, number> = {}
  const errors: Record<string, string> = {}

  // Fetch every table (sequential keeps memory/connection use modest)
  for (const t of TABLES) {
    const { rows, error } = await fetchAll(supabase, t.name, t.key ?? 'user_id', uid)
    tables[t.name] = rows
    counts[t.name] = rows.length
    if (error) errors[t.name] = error
  }

  // Attachment files: signed URLs (1h) so the files can be downloaded too
  const attachments = (tables['attachments'] ?? []) as { file_path?: string }[]
  let attachmentUrls: Record<string, string> = {}
  const paths = attachments.map(a => a.file_path).filter(Boolean) as string[]
  if (paths.length > 0) {
    const { data: signed } = await supabase.storage.from('vaultr-attachments').createSignedUrls(paths, 3600)
    for (const s of signed ?? []) if (s.signedUrl && s.path) attachmentUrls[s.path] = s.signedUrl
  }

  return NextResponse.json({
    format: 'inex-backup',
    version: 1,
    exported_at: new Date().toISOString(),
    user_id: uid,
    counts,
    tables,
    attachment_urls: attachmentUrls,
    errors: Object.keys(errors).length ? errors : undefined,
  })
}
