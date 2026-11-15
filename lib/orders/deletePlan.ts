// What deleting an order takes with it, and when it must refuse.
//
// An order is a spine, not a container. The paperwork it raised — the sales
// order, the purchase order, the quotation, the challan — exists because the
// order exists, and deleting the order should take them. The money does not:
// a customer invoice carries a number in a GST series and a supplier bill is
// an expense you may already have claimed. Those survive and simply stop
// pointing at an order that is gone.
//
// AND IT REFUSES WHEN MONEY HAS MOVED.
//
// An order with a paid invoice against it is not a mistake somebody made
// while setting up — it is a finished trade. Deleting it would cut the
// invoice loose from the job that explains it, and nothing would say why that
// money came in. So the delete stops and names what is in the way, and you
// decide: settle it, unlink it, or leave the order alone.
//
// A document that has merely been SENT is still deleted. Deleting the
// paperwork is the whole point of the feature, and a purchase order emailed
// to a supplier is exactly the thing you want gone when the order falls
// through. Money is the test, not paper.
//
// Pure. The API recomputes this server-side before deleting anything — the
// preview and the delete must be the same decision, and the client's copy of
// it is not evidence.

import { docConfig } from '@/lib/documents/config'

export interface OrderDocRow {
  id: string
  doc_type: string
  number: string
}
export interface OrderInvoiceRow {
  id: string
  invoice_number?: string | null
  paid_amount?: number | null
  status?: string | null
}
export interface OrderBillRow {
  id: string
  invoice_number?: string | null
  is_paid?: boolean | null
}
export interface OrderTxnRow {
  id: string
  amount?: number | null
  date?: string | null
}

export interface DeleteBlocker {
  label: string
  reason: string
}

export interface DeletePlan {
  canDelete: boolean
  /** Why not, in the words that say what to go and fix. */
  blockers: DeleteBlocker[]
  /** Documents that go with the order. */
  documents: { id: string; label: string }[]
  fileCount: number
  /** What stays behind, unlinked. */
  kept: { label: string; count: number }[]
}

export interface DeletePlanInput {
  documents: readonly OrderDocRow[]
  invoices: readonly OrderInvoiceRow[]
  bills: readonly OrderBillRow[]
  transactions: readonly OrderTxnRow[]
  fileCount?: number
}

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0)

function docLabel(d: OrderDocRow): string {
  const name = docConfig(d.doc_type)?.label ?? d.doc_type.replace(/_/g, ' ')
  return `${name} ${d.number}`.trim()
}

const PAID_STATUSES = new Set(['paid', 'partial', 'partially_paid'])

export function planOrderDelete(input: DeletePlanInput): DeletePlan {
  const blockers: DeleteBlocker[] = []

  for (const inv of input.invoices) {
    const paid = num(inv.paid_amount)
    const status = String(inv.status ?? '').toLowerCase()
    if (paid > 0 || PAID_STATUSES.has(status)) {
      blockers.push({
        label: `Invoice ${inv.invoice_number ?? ''}`.trim(),
        reason: paid > 0 ? 'has payment against it' : `is marked ${status}`,
      })
    }
  }

  for (const bill of input.bills) {
    if (bill.is_paid) {
      blockers.push({
        label: `Supplier bill ${bill.invoice_number ?? ''}`.trim(),
        reason: 'is marked paid',
      })
    }
  }

  // Any bank entry at all. Unlike an invoice, a transaction IS the money —
  // there is no unpaid version of one.
  if (input.transactions.length) {
    const n = input.transactions.length
    blockers.push({
      label: `${n} bank entr${n === 1 ? 'y' : 'ies'}`,
      reason: 'filed against this order',
    })
  }

  const kept: { label: string; count: number }[] = []
  if (input.invoices.length) kept.push({ label: 'customer invoice', count: input.invoices.length })
  if (input.bills.length) kept.push({ label: 'supplier bill', count: input.bills.length })
  if (input.transactions.length) kept.push({ label: 'bank entry', count: input.transactions.length })

  return {
    canDelete: blockers.length === 0,
    blockers,
    documents: input.documents.map(d => ({ id: d.id, label: docLabel(d) })),
    fileCount: input.fileCount ?? 0,
    kept,
  }
}

/** One line saying what is about to happen, for the confirmation. */
export function deleteSummary(plan: DeletePlan): string {
  const bits: string[] = ['this order']
  if (plan.documents.length) bits.push(`${plan.documents.length} document${plan.documents.length === 1 ? '' : 's'}`)
  if (plan.fileCount) bits.push(`${plan.fileCount} file${plan.fileCount === 1 ? '' : 's'}`)
  const list = bits.length === 1 ? bits[0] : `${bits.slice(0, -1).join(', ')} and ${bits[bits.length - 1]}`
  return `Deletes ${list}.`
}
