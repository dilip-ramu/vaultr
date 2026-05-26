import type { RecoverableAllocation, ImportBatch, SupplierBalance, DashboardStats } from '../types'

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function aggregateSupplierBalances(
  allocations: RecoverableAllocation[],
): SupplierBalance[] {
  const map = new Map<string, SupplierBalance>()

  for (const a of allocations) {
    if (!map.has(a.supplier_name)) {
      map.set(a.supplier_name, {
        supplierName:    a.supplier_name,
        customerId:      a.customer_id,
        pendingAmount:   0,
        billedAmount:    0,
        paidAmount:      0,
        totalAmount:     0,
        allocationCount: 0,
        lastActivity:    a.updated_at ?? a.created_at,
      })
    }

    const entry = map.get(a.supplier_name)!
    entry.allocationCount++
    entry.totalAmount = round2(entry.totalAmount + a.recoverable_amount)

    if (a.status === 'pending')   entry.pendingAmount = round2(entry.pendingAmount + a.recoverable_amount)
    else if (a.status === 'billed') entry.billedAmount = round2(entry.billedAmount + a.recoverable_amount)
    else if (a.status === 'paid')   entry.paidAmount   = round2(entry.paidAmount   + a.recoverable_amount)

    // Keep the most recent activity timestamp
    const ts = a.updated_at ?? a.created_at
    if (ts && (!entry.lastActivity || ts > entry.lastActivity)) {
      entry.lastActivity = ts
    }
  }

  return Array.from(map.values()).sort((a, b) => b.pendingAmount - a.pendingAmount)
}

export function calcDashboardStats(
  batches: ImportBatch[],
  allocations: RecoverableAllocation[],
  currency: string,
): DashboardStats {
  let totalPending = 0
  let totalBilled  = 0
  let totalPaid    = 0

  for (const a of allocations) {
    if (a.status === 'pending')  totalPending = round2(totalPending + a.recoverable_amount)
    else if (a.status === 'billed') totalBilled = round2(totalBilled + a.recoverable_amount)
    else if (a.status === 'paid')   totalPaid   = round2(totalPaid   + a.recoverable_amount)
  }

  const supplierNames = new Set(allocations.map(a => a.supplier_name))

  return {
    totalPending,
    totalBilled,
    totalPaid,
    batchCount:    batches.length,
    supplierCount: supplierNames.size,
    currency,
  }
}
