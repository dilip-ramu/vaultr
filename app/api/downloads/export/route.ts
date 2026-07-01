import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { from, to } = await req.json() as { from: string; to: string }

  // Run all queries in parallel — use select('*') everywhere to avoid FK-resolution failures
  const [
    txRes, acRes, catRes, payeeRes,
    riRes, siRes, ceRes, ciRes, peRes, stRes, blRes, attRes,
  ] = await Promise.all([

    // Transactions (raw — we'll enrich with lookup maps below)
    supabase.from('transactions')
      .select('*')
      .eq('user_id', user.id)
      .gte('date', from).lte('date', to)
      .order('date', { ascending: false }),

    // Bank accounts — query the view so computed balance is included
    supabase.from('account_balances')
      .select('*')
      .eq('user_id', user.id)
      .order('name'),

    // Lookup: categories
    supabase.from('categories')
      .select('id, name')
      .eq('user_id', user.id),

    // Lookup: payees
    supabase.from('payees')
      .select('id, name')
      .eq('user_id', user.id),

    // Recoverable invoices
    supabase.from('recoverable_invoices')
      .select('*')
      .eq('user_id', user.id)
      .gte('invoice_date', from).lte('invoice_date', to)
      .order('invoice_date', { ascending: false }),

    // Supplier invoices (raw — supplier name added below)
    supabase.from('supplier_invoices')
      .select('*')
      .eq('user_id', user.id)
      .gte('invoice_date', from).lte('invoice_date', to)
      .order('invoice_date', { ascending: false }),

    // Contrast expenses
    supabase.from('transactions')
      .select('*')
      .eq('user_id', user.id)
      .not('contrast_billing_category_id', 'is', null)
      .gte('date', from).lte('date', to)
      .order('date', { ascending: false }),

    // Contrast (now reimbursement) invoices — Batch E · Deploy 6 dropped the
    // contrast_invoices table; reimbursements live in recoverable_invoices
    // with invoice_type='reimbursement'. Shape-adapted below so downstream
    // download CSV/PDF code doesn't have to change.
    supabase.from('recoverable_invoices')
      .select('id, invoice_number, invoice_month, invoice_date, status, subtotal, cgst_amount, sgst_amount, total, notes, sent_at, created_at, customer_id, customer_name')
      .eq('user_id', user.id)
      .eq('invoice_type', 'reimbursement')
      .gte('invoice_date', from).lte('invoice_date', to)
      .order('invoice_date', { ascending: false }),

    // Payroll entries
    supabase.from('payroll_entries')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }),

    // Staff
    supabase.from('employees')
      .select('*')
      .eq('user_id', user.id)
      .order('name'),

    // Bills & subscriptions
    supabase.from('bills')
      .select('*')
      .eq('user_id', user.id)
      .order('due_date', { ascending: false }),

    // Attachments
    supabase.from('attachments')
      .select('*')
      .eq('user_id', user.id),
  ])

  // ── Build lookup maps for FK enrichment ────────────────────────────────────
  type Row = Record<string, unknown>

  const catMap   = Object.fromEntries((catRes.data   ?? []).map((r: Row) => [r.id, r.name]))
  const payeeMap = Object.fromEntries((payeeRes.data ?? []).map((r: Row) => [r.id, r.name]))
  const acMap    = Object.fromEntries((acRes.data    ?? []).map((r: Row) => [r.id, { name: r.name, type: r.type }]))

  // Enrich transactions with readable names
  const transactions = (txRes.data ?? []).map((tx: Row) => ({
    ...tx,
    category_name:  catMap[tx.category_id as string]                 ?? null,
    payee_name:     payeeMap[tx.payee_id as string]                   ?? null,
    account_name:   (acMap[tx.account_id as string] as Row)?.name    ?? null,
    account_type:   (acMap[tx.account_id as string] as Row)?.type    ?? null,
  }))

  // Enrich contrast expenses — need billing category lookup too
  const cbcRes = await supabase
    .from('contrast_billing_categories')
    .select('id, name')
    .eq('user_id', user.id)
  const cbcMap = Object.fromEntries((cbcRes.data ?? []).map((r: Row) => [r.id, r.name]))

  const contrast_expenses = (ceRes.data ?? []).map((tx: Row) => ({
    ...tx,
    category_name:         catMap[tx.category_id as string]                           ?? null,
    billing_category_name: cbcMap[tx.contrast_billing_category_id as string]          ?? null,
  }))

  // ── Payroll: enrich entries with full employee + month info ───────────────
  const [empRes, pmRes, settingsRes] = await Promise.all([
    supabase.from('employees').select('*').eq('user_id', user.id),          // full row — needed for salary slips
    supabase.from('payroll_months').select('*').eq('user_id', user.id),     // full row
    supabase.from('recoverable_invoice_settings').select('company_name, company_address').eq('user_id', user.id).maybeSingle(),
  ])
  const empMap = Object.fromEntries((empRes.data ?? []).map((r: Row) => [r.id, r]))
  const pmMap  = Object.fromEntries((pmRes.data  ?? []).map((r: Row) => [r.id, r]))
  const payroll_entries = (peRes.data ?? []).map((e: Row) => ({
    ...e,
    employee:      empMap[e.employee_id as string] ?? null,
    payroll_month: pmMap[e.payroll_month_id as string] ?? null,
  }))

  // ── Supplier invoices: enrich with supplier name ───────────────────────────
  const supRes = await supabase.from('suppliers').select('id, name').eq('user_id', user.id)
  const supMap = Object.fromEntries((supRes.data ?? []).map((r: Row) => [r.id, r.name]))
  const supplier_invoices = (siRes.data ?? []).map((inv: Row) => ({
    ...inv,
    supplier_name: supMap[inv.supplier_id as string] ?? null,
  }))

  // ── Attachments: signed URLs + parent names ────────────────────────────────
  const rawAttachments = (attRes.data ?? []) as Row[]
  const txMap  = Object.fromEntries(transactions.map((t: Row) => [t.id, t]))
  const billMap = Object.fromEntries((blRes.data ?? []).map((b: Row) => [b.id, b]))

  const filteredAttachments = rawAttachments.filter((att: Row) => {
    if (att.transaction_id) {
      const tx = txMap[att.transaction_id as string] as Row | undefined
      if (tx?.date) return (tx.date as string) >= from && (tx.date as string) <= to
    }
    return true
  })

  let attachmentsWithUrls: unknown[] = []
  if (filteredAttachments.length > 0) {
    const paths = filteredAttachments.map((a: Row) => a.file_path as string)
    const { data: signedUrlData } = await supabase.storage
      .from('vaultr-attachments')
      .createSignedUrls(paths, 3600)

    const urlMap: Record<string, string> = {}
    for (const su of (signedUrlData ?? [])) {
      if (su.signedUrl && su.path) urlMap[su.path] = su.signedUrl
    }

    attachmentsWithUrls = filteredAttachments.map((att: Row) => {
      const parentTx   = txMap[att.transaction_id as string]  as Row | undefined
      const parentBill = billMap[att.bill_id as string]       as Row | undefined
      return {
        ...att,
        signed_url:   urlMap[att.file_path as string] ?? null,
        parent_name:  (parentTx?.name ?? parentBill?.name ?? 'attachment') as string,
        parent_date:  (parentTx?.date ?? '') as string,
      }
    })
  }

  // ── Collect any query errors ───────────────────────────────────────────────
  const errors: Record<string, string> = {}
  if (txRes.error)   errors.transactions         = txRes.error.message
  if (acRes.error)   errors.accounts             = acRes.error.message  // account_balances view
  if (riRes.error)   errors.recoverable_invoices = riRes.error.message
  if (siRes.error)   errors.supplier_invoices    = siRes.error.message
  if (ceRes.error)   errors.contrast_expenses    = ceRes.error.message
  if (ciRes.error)   errors.contrast_invoices    = ciRes.error.message
  if (peRes.error)   errors.payroll_entries      = peRes.error.message
  if (stRes.error)   errors.staff                = stRes.error.message
  if (blRes.error)   errors.bills                = blRes.error.message
  if (attRes.error)  errors.attachments          = attRes.error.message

  if (Object.keys(errors).length > 0) {
    console.error('[downloads/export] query errors:', errors)
  }

  // Shape-adapt reimbursement rows back to the historical contrast_invoices
  // field names the CSV/PDF renderers expect: sent_at→finalized_at,
  // cgst_amount+sgst_amount→gst_amount.
  type ReimbRow = {
    id: string; invoice_number: string; invoice_month: string | null;
    invoice_date: string; status: string;
    subtotal: number; cgst_amount: number; sgst_amount: number; total: number;
    notes: string | null; sent_at: string | null; created_at: string;
    customer_id: string | null; customer_name: string;
  }
  const contrastInvoicesAdapted = ((ciRes.data ?? []) as ReimbRow[]).map(r => ({
    id:             r.id,
    invoice_number: r.invoice_number,
    invoice_month:  r.invoice_month ?? '',
    invoice_date:   r.invoice_date,
    status:         r.status,
    subtotal:       Number(r.subtotal ?? 0),
    gst_amount:     Number(r.cgst_amount ?? 0) + Number(r.sgst_amount ?? 0),
    total:          Number(r.total ?? 0),
    notes:          r.notes,
    finalized_at:   r.sent_at,
    created_at:     r.created_at,
    customer_id:    r.customer_id,
    customer_name:  r.customer_name,
  }))

  return NextResponse.json({
    transactions,
    accounts:             acRes.data  ?? [],
    recoverable_invoices: riRes.data  ?? [],
    supplier_invoices,
    contrast_expenses,
    contrast_invoices:    contrastInvoicesAdapted,
    payroll_entries,
    staff:                stRes.data  ?? [],
    bills:                blRes.data  ?? [],
    attachments:          attachmentsWithUrls,
    meta: {
      from, to, exported_at: new Date().toISOString(),
      company_name:    settingsRes.data?.company_name    ?? null,
      company_address: settingsRes.data?.company_address ?? null,
    },
    query_errors: Object.keys(errors).length > 0 ? errors : undefined,
  })
}
