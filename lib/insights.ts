import type { Transaction, Account, Budget, Bill, Category } from './types'

export interface Insight {
  id: string
  type: 'positive' | 'warning' | 'info' | 'alert'
  icon: string
  title: string
  body: string
  action?: { label: string; href: string }
  priority: number
}

export function generateInsights(params: {
  transactions: Transaction[]
  accounts: Account[]
  budgets: Budget[]
  currentMonth: Date
  bills?: Bill[]
}): Insight[] {
  const { transactions, accounts, budgets, currentMonth, bills = [] } = params
  const insights: Insight[] = []

  // ── Month bounds ──────────────────────────────────────────
  const cy = currentMonth.getFullYear()
  const cm = currentMonth.getMonth()

  const thisStart = `${cy}-${String(cm + 1).padStart(2, '0')}-01`
  const thisEnd   = new Date(cy, cm + 1, 0).toISOString().split('T')[0]

  const prevDate  = new Date(cy, cm - 1, 1)
  const py = prevDate.getFullYear()
  const pm = prevDate.getMonth()
  const prevStart = `${py}-${String(pm + 1).padStart(2, '0')}-01`
  const prevEnd   = new Date(py, pm + 1, 0).toISOString().split('T')[0]

  // ── Partition transactions ────────────────────────────────
  const thisTx   = transactions.filter(t => t.date >= thisStart && t.date <= thisEnd)
  const prevTx   = transactions.filter(t => t.date >= prevStart && t.date <= prevEnd)

  const thisExp  = thisTx.filter(t => t.type === 'expense')
  const thisInc  = thisTx.filter(t => t.type === 'income')
  const prevExp  = prevTx.filter(t => t.type === 'expense')

  const thisExpTotal = thisExp.reduce((s, t) => s + t.amount, 0)
  const thisIncTotal = thisInc.reduce((s, t) => s + t.amount, 0)
  const prevExpTotal = prevExp.reduce((s, t) => s + t.amount, 0)

  // ── 1. Spending trend ─────────────────────────────────────
  if (prevExpTotal > 0 && thisExpTotal > 0) {
    const pct = ((thisExpTotal - prevExpTotal) / prevExpTotal) * 100
    if (pct > 20) {
      insights.push({
        id: 'spending-up',
        type: 'warning',
        icon: '📈',
        title: `Spending up ${pct.toFixed(0)}% vs last month`,
        body: `${fmt(thisExpTotal)} spent this month vs ${fmt(prevExpTotal)} last month.`,
        action: { label: 'View transactions', href: '/transactions' },
        priority: 4,
      })
    } else if (pct < -20) {
      insights.push({
        id: 'spending-down',
        type: 'positive',
        icon: '🎉',
        title: `You spent ${Math.abs(pct).toFixed(0)}% less than last month`,
        body: `Down to ${fmt(thisExpTotal)} from ${fmt(prevExpTotal)} — great discipline!`,
        priority: 8,
      })
    }
  }

  // ── 2. Top category ───────────────────────────────────────
  const catMap: Record<string, { name: string; color: string; total: number }> = {}
  for (const tx of thisExp) {
    const cat = tx.category as Category | undefined
    if (!cat) continue
    if (!catMap[cat.id]) catMap[cat.id] = { name: cat.name, color: cat.color, total: 0 }
    catMap[cat.id].total += tx.amount
  }
  const topCat = Object.values(catMap).sort((a, b) => b.total - a.total)[0]
  if (topCat) {
    insights.push({
      id: 'top-category',
      type: 'info',
      icon: '🏷️',
      title: `Biggest spend: ${topCat.name}`,
      body: `You've spent ${fmt(topCat.total)} on ${topCat.name} this month.`,
      action: { label: 'View categories', href: '/categories' },
      priority: 10,
    })
  }

  // ── 3. Savings rate ───────────────────────────────────────
  if (thisIncTotal > 0) {
    const rate = ((thisIncTotal - thisExpTotal) / thisIncTotal) * 100
    if (rate > 20) {
      insights.push({
        id: 'savings-good',
        type: 'positive',
        icon: '💰',
        title: `Great job — you saved ${rate.toFixed(0)}% of income this month`,
        body: `Earned ${fmt(thisIncTotal)}, saved ${fmt(thisIncTotal - thisExpTotal)}.`,
        priority: 7,
      })
    } else if (rate < 0) {
      insights.push({
        id: 'overspend',
        type: 'alert',
        icon: '🚨',
        title: 'Spending exceeded income this month',
        body: `Earned ${fmt(thisIncTotal)} but spent ${fmt(thisExpTotal)} — deficit of ${fmt(thisExpTotal - thisIncTotal)}.`,
        action: { label: 'Review budgets', href: '/budgets' },
        priority: 2,
      })
    }
  }

  // ── 4. Unusual spend (vs 3-month average) ─────────────────
  const threeMonthsBack = new Date(cy, cm - 3, 1).toISOString().split('T')[0]
  const histExp = transactions.filter(
    t => t.type === 'expense' && t.date >= threeMonthsBack && t.date < thisStart
  )
  const histCat: Record<string, { name: string; monthlyTotals: Record<string, number> }> = {}
  for (const tx of histExp) {
    const cat = tx.category as Category | undefined
    if (!cat) continue
    if (!histCat[cat.id]) histCat[cat.id] = { name: cat.name, monthlyTotals: {} }
    const mk = tx.date.slice(0, 7)
    histCat[cat.id].monthlyTotals[mk] = (histCat[cat.id].monthlyTotals[mk] ?? 0) + tx.amount
  }
  let worstUnusual: { name: string; pct: number; current: number; avg: number } | null = null
  for (const [id, data] of Object.entries(histCat)) {
    const avg = Object.values(data.monthlyTotals).reduce((s, v) => s + v, 0) / 3
    const current = catMap[id]?.total ?? 0
    if (avg > 100 && current > avg * 2) {
      const pct = ((current - avg) / avg) * 100
      if (!worstUnusual || pct > worstUnusual.pct) {
        worstUnusual = { name: data.name, pct, current, avg }
      }
    }
  }
  if (worstUnusual) {
    insights.push({
      id: 'unusual-spend',
      type: 'warning',
      icon: '⚠️',
      title: `Unusual spike in ${worstUnusual.name}`,
      body: `Spent ${fmt(worstUnusual.current)} — ${worstUnusual.pct.toFixed(0)}% above your 3-month average of ${fmt(worstUnusual.avg)}.`,
      priority: 5,
    })
  }

  // ── 5. Budget warnings ────────────────────────────────────
  const today = new Date()
  const daysLeft = new Date(cy, cm + 1, 0).getDate() - today.getDate()
  for (const b of budgets) {
    const pct = b.percentage ?? 0
    if (pct < 80) continue
    insights.push({
      id: `budget-${b.id}`,
      type: pct >= 100 ? 'alert' : 'warning',
      icon: pct >= 100 ? '🔴' : '🟡',
      title: `${b.category?.name ?? 'Budget'} is ${pct.toFixed(0)}% used`,
      body: `${fmt(b.spent ?? 0)} of ${fmt(b.amount)} spent with ${daysLeft} days left.`,
      action: { label: 'View budgets', href: '/budgets' },
      priority: pct >= 100 ? 2 : 3,
    })
  }

  // ── 6. Largest transaction ────────────────────────────────
  const biggest = [...thisExp].sort((a, b) => b.amount - a.amount)[0]
  if (biggest) {
    const label = biggest.name
      || (biggest.category as Category | undefined)?.name
      || 'expense'
    insights.push({
      id: 'largest-tx',
      type: 'info',
      icon: '💸',
      title: `Largest expense: ${fmt(biggest.amount)}`,
      body: `"${label}" on ${fmtDate(biggest.date)} was your biggest single expense this month.`,
      action: { label: 'View transactions', href: '/transactions' },
      priority: 11,
    })
  }

  // ── 7. No income alert ────────────────────────────────────
  if (thisInc.length === 0) {
    insights.push({
      id: 'no-income',
      type: 'info',
      icon: '📥',
      title: 'No income recorded this month',
      body: "Don't forget to log your income — it helps track your savings rate accurately.",
      action: { label: 'Add transaction', href: '/transactions' },
      priority: 6,
    })
  }

  // ── 8. Net worth growth ───────────────────────────────────
  const netChange = thisIncTotal - thisExpTotal
  if (netChange > 0) {
    const netWorth = accounts
      .filter(a => a.include_in_net_worth)
      .reduce((s, a) => s + (a.balance ?? 0), 0)
    insights.push({
      id: 'net-worth-up',
      type: 'positive',
      icon: '📈',
      title: `Net worth grew by ${fmt(netChange)} this month`,
      body: `Your finances are trending in the right direction. Current net worth: ${fmt(netWorth)}.`,
      priority: 9,
    })
  }

  // ── 9. Bills due soon ─────────────────────────────────────
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  for (const bill of bills) {
    if (bill.status !== 'pending') continue
    const due = new Date(bill.due_date)
    due.setHours(0, 0, 0, 0)
    const daysUntil = Math.ceil((due.getTime() - now.getTime()) / 86400000)
    if (daysUntil < 0 || daysUntil > 3) continue
    const dueLabel = daysUntil === 0 ? 'today' : `in ${daysUntil} day${daysUntil > 1 ? 's' : ''}`
    insights.push({
      id: `bill-${bill.id}`,
      type: 'alert',
      icon: '⚡',
      title: `${bill.name} due ${dueLabel}`,
      body: `${fmt(bill.amount)} due ${dueLabel}. Don't miss it.`,
      action: { label: 'View bills', href: '/bills' },
      priority: 1,
    })
  }

  return insights.sort((a, b) => a.priority - b.priority).slice(0, 5)
}

// ── Private helpers ───────────────────────────────────────────────
function fmt(n: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency', currency: 'INR',
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(n)
}

function fmtDate(s: string): string {
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' }).format(new Date(s))
}
