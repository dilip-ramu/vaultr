// Where an order has got to.
//
// Six stages, not twelve. Every extra stage is a decision somebody has to make
// on a screen, and a trade only really has six moments worth naming: you are
// talking about it, it is confirmed, it is bought, it has gone, it is
// invoiced, it is finished.
//
// The stage is YOURS to set — it is not derived from what documents exist.
// Derived stages lie: a sales order can exist for a job that fell through, and
// a shipment can go before anybody gets round to making the challan. What the
// app does instead is NOTICE when the paperwork has moved past the stage and
// offer to move it, which `suggestedStage` is for.

export const OPEN_STAGES = ['enquiry', 'confirmed', 'ordered', 'shipped', 'invoiced'] as const
export const ALL_STAGES = [...OPEN_STAGES, 'closed', 'cancelled'] as const

export type OpenStage = typeof OPEN_STAGES[number]
export type OrderStage = typeof ALL_STAGES[number]

export interface StageMeta {
  key: OrderStage
  label: string
  /** One line saying what this stage means, in the words of the job. */
  hint: string
  tone: 'grey' | 'amber' | 'blue' | 'violet' | 'green'
}

export const STAGE_META: Record<OrderStage, StageMeta> = {
  enquiry:   { key: 'enquiry',   label: 'Enquiry',   hint: 'Talking about it. Nothing is committed either way.',        tone: 'grey' },
  confirmed: { key: 'confirmed', label: 'Confirmed', hint: 'Customer PO in hand. Supplier price agreed or being agreed.', tone: 'amber' },
  ordered:   { key: 'ordered',   label: 'Ordered',   hint: 'Purchase order placed. Goods are being made.',             tone: 'blue' },
  shipped:   { key: 'shipped',   label: 'Shipped',   hint: 'Gone, in full or in part.',                                tone: 'violet' },
  invoiced:  { key: 'invoiced',  label: 'Invoiced',  hint: 'Customer invoiced. Waiting on money.',                     tone: 'violet' },
  closed:    { key: 'closed',    label: 'Closed',    hint: 'Everybody paid, sheet locked.',                            tone: 'green' },
  cancelled: { key: 'cancelled', label: 'Cancelled', hint: 'Did not happen.',                                          tone: 'grey' },
}

export function stageMeta(stage: string): StageMeta {
  return STAGE_META[stage as OrderStage] ?? STAGE_META.enquiry
}

/** An order still being worked on — what the default list shows. */
export function isOpen(stage: string): boolean {
  return (OPEN_STAGES as readonly string[]).includes(stage)
}

/** How far along, for a progress bar. Closed is full; cancelled has no bar. */
export function stageIndex(stage: string): number {
  const i = (OPEN_STAGES as readonly string[]).indexOf(stage)
  if (i >= 0) return i
  return stage === 'closed' ? OPEN_STAGES.length : -1
}

/**
 * Which stages you may move to by hand.
 *
 * Backwards is always allowed — you correct a mis-click far more often than
 * you cancel an order, and a stage you cannot take back is a stage people
 * stop setting honestly.
 *
 * Two are NOT in the list, on purpose:
 *  - `closed` is reached by closing the order, which writes bank entries. A
 *    dropdown must never be able to do that.
 *  - from `closed`, nothing moves until the order is reopened, which undoes
 *    those entries.
 */
export function allowedStages(current: string): OrderStage[] {
  if (current === 'closed') return []
  return [...OPEN_STAGES, 'cancelled']
}

export function canMoveTo(current: string, next: string): boolean {
  return (allowedStages(current) as string[]).includes(next)
}

/** What the paperwork says has happened. */
export interface Paperwork {
  hasSalesOrder?: boolean
  hasPurchaseOrder?: boolean
  /** Any quantity shipped at all, in full or in part. */
  hasShipped?: boolean
  hasCustomerInvoice?: boolean
}

/**
 * The stage the paperwork has reached — offered, never applied.
 *
 * Only ever points FORWARD. If you have deliberately moved an order back, the
 * app should not keep shoving it forward again, so a suggestion that is behind
 * the current stage is no suggestion at all.
 */
export function suggestedStage(current: string, p: Paperwork): OpenStage | null {
  if (!isOpen(current)) return null
  const reached: OpenStage =
    p.hasCustomerInvoice ? 'invoiced'
    : p.hasShipped        ? 'shipped'
    : p.hasPurchaseOrder  ? 'ordered'
    : p.hasSalesOrder     ? 'confirmed'
    : 'enquiry'
  return stageIndex(reached) > stageIndex(current) ? reached : null
}
