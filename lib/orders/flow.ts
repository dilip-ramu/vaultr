// The order page as a flow, not a filing cabinet.
//
// The work has an order to it: the customer sends a PO, you confirm it with a
// sales order, you agree a price and raise a purchase order, you work out what
// you will make, you invoice. The page should say where you are in that and
// what the next thing to press is — not present nine equal panels and leave
// you to remember.
//
// Only ONE step is current at a time: the first one not done. Everything
// before it is ticked, everything after it is still there and still clickable
// — this marks the path, it does not block it. An order that arrives with the
// purchase order already placed should not be argued with.

export type StepKey = 'files' | 'sales_order' | 'purchase_order' | 'pl' | 'invoice'

export interface OrderFacts {
  customerFiles: number
  supplierFiles: number
  hasSalesOrder: boolean
  hasPurchaseOrder: boolean
  /** A supplier cost has been agreed, so the P/L is about something real. */
  costAgreed: boolean
  /** At least one cost or adjustment line has been thought about. */
  costsEntered: boolean
  hasCustomerInvoice: boolean
  closed?: boolean
}

export interface FlowStep {
  key: StepKey
  label: string
  /** One line in the words of the job. */
  hint: string
  /** The button. Null when the step has nothing to press. */
  action: string | null
  done: boolean
  current: boolean
  /** Shown instead of the hint once the step is done. */
  doneNote?: string
}

export function orderFlow(f: OrderFacts): FlowStep[] {
  const steps: Omit<FlowStep, 'current'>[] = [
    {
      key: 'files',
      label: 'Their order',
      hint: 'Put the customer PO and anything they sent on the order.',
      action: 'Attach customer files',
      done: f.customerFiles > 0,
      doneNote: `${f.customerFiles} file${f.customerFiles === 1 ? '' : 's'} from the customer`,
    },
    {
      key: 'sales_order',
      label: 'Confirm it',
      hint: 'Send the customer a sales order so the job is agreed in writing.',
      action: 'Create sales order',
      done: f.hasSalesOrder,
      doneNote: 'Sales order raised',
    },
    {
      key: 'purchase_order',
      label: 'Buy it',
      hint: 'Agree the price, then raise the purchase order and send the supplier their pack.',
      action: 'Create purchase order',
      done: f.hasPurchaseOrder,
      doneNote: 'Purchase order raised',
    },
    {
      key: 'pl',
      label: 'Work out the profit',
      hint: 'Add freight, clearing and the rest so the margin is the real one.',
      action: 'Go to the P/L',
      // Not done until the costs have actually been looked at: a sheet with a
      // supplier price and nothing else is a gross margin, not a profit.
      done: f.costAgreed && f.costsEntered,
      doneNote: 'Costed',
    },
    {
      key: 'invoice',
      label: 'Invoice',
      hint: 'Bill the customer for what has shipped, then attach it back here.',
      action: 'Create customer invoice',
      done: f.hasCustomerInvoice,
      doneNote: 'Customer invoiced',
    },
  ]

  const currentIndex = f.closed ? -1 : steps.findIndex(s => !s.done)
  return steps.map((s, i) => ({ ...s, current: i === currentIndex }))
}

/** What the page nudges you towards. Null when there is nothing left to do. */
export function nextStep(f: OrderFacts): FlowStep | null {
  return orderFlow(f).find(s => s.current) ?? null
}

/** How much of the flow is behind you, for a bar. */
export function flowProgress(f: OrderFacts): number {
  const steps = orderFlow(f)
  return Math.round((steps.filter(s => s.done).length / steps.length) * 100)
}
