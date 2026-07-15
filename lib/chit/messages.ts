// WhatsApp message text for chit members.
//
// Two messages a month: the auction NOTICE (before the auction) and the RESULT
// (after). Both are built here as plain functions so the wording is in one place,
// testable, and identical for every member — the UI just fills in the member's
// number and opens a wa.me link.
//
// These return the message body only. Delivery is a wa.me deep link, which needs
// no API key and works from any phone; see the notify UI.

export interface NoticeParams {
  companyName: string
  chitValue: number
  members: number
  tenureMonths: number
  startDate?: string | null      // ISO or already-formatted; formatted if ISO
  installment: number
  dueDay?: number | null         // day of month, e.g. 14
  auctionTime?: string           // "6:30 PM"
  monthNumber: number
  auctionDate?: string | null    // ISO or formatted
  bidCeilingPct: number
  bankLine?: string              // free text: account name / number
}

export interface ResultParams {
  dateText: string               // "15/06/26" — as you want it shown
  monthNumber: number
  tenureMonths: number
  winnerName: string
  auctionAmount: number          // what the winner receives (net payout)
  discount: number               // the winning bid
  dueAmount: number              // per-member due that month
}

const inr = (n: number) => '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN')

/** 1 → "1st", 2 → "2nd", 4 → "4th". */
export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

/** dd.mm.yyyy from an ISO date; passes non-ISO text through unchanged. */
export function niceDate(d?: string | null): string {
  if (!d) return ''
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d)
  if (!m) return d
  return `${m[3]}.${m[2]}.${m[1]}`
}

/**
 * The scheduled date of month N's auction.
 *
 * Month 1 is the start month; each later month is one calendar month on, landing
 * on the group's auction day. So a chit starting 14.04 with auction day 14 has
 * its 4th auction on 14.07 and its 5th on 14.08 — NOT the start date, which was
 * the bug (every notice showed 14.04). The day is clamped to the month's length
 * so a "31" auction day still resolves in February.
 */
export function scheduledAuctionDate(
  startDate: string | null | undefined,
  auctionDay: number | null | undefined,
  monthNumber: number,
): string | null {
  if (!startDate) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(startDate)
  if (!m) return null

  let year = Number(m[1])
  let month = Number(m[2]) - 1 + (monthNumber - 1)      // 0-based, plus the offset
  year += Math.floor(month / 12)
  month = ((month % 12) + 12) % 12

  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  const day = Math.min(auctionDay || Number(m[3]), daysInMonth)

  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** Message 1 — the pre-auction notice. */
export function auctionNotice(p: NoticeParams): string {
  const lines: string[] = []
  lines.push(`📢 ${ordinal(p.monthNumber)} Month Chit Auction Notification`)
  lines.push('')
  lines.push(`💰 Chit Scheme: ${inr(p.chitValue)} Monthly Chit`)
  lines.push(`👥 Members: ${p.members}`)
  lines.push(`📆 Tenure: ${p.tenureMonths} Months`)
  if (p.startDate) lines.push(`🚀 Start Date: ${niceDate(p.startDate)}`)
  lines.push('')
  lines.push('📌 Details:')
  lines.push(`• 💵 Monthly Subscription: ${inr(p.installment)} per member`)
  if (p.dueDay) lines.push(`• 📅 Due Date: Every month on ${ordinal(p.dueDay)}`)
  if (p.auctionTime) lines.push(`• 🕡 Auction Time: ${p.auctionTime}`)
  if (p.auctionDate) lines.push(`• 📅 ${ordinal(p.monthNumber)} Month Auction Date: ${niceDate(p.auctionDate)}`)
  lines.push('• 📉 Bid starts from ZERO (₹0)')
  lines.push(`• 📊 Maximum Discount (Bid): Up to ${p.bidCeilingPct}% (final allotment as per auction rules)`)
  lines.push('')
  lines.push('🏦 Payment Instructions:')
  lines.push(`All payments must be transferred only to the designated bank account of ${p.companyName}${p.bankLine ? ` (${p.bankLine})` : ''}.`)
  lines.push('')
  lines.push('📘 Note:')
  lines.push('• Members are requested to attend the auction without fail.')
  lines.push('• Timely payment is mandatory for smooth operation of the chit.')
  lines.push('• Kindly clear any pending dues before the auction date.')
  lines.push('')
  lines.push('🙏 Thank you for your cooperation.')
  return lines.join('\n')
}

/**
 * Message 2 — the auction result.
 *
 * `showWinner` controls the "Winner- X" line. Off by choice: this often goes to a
 * whole-group WhatsApp, and the operator may not want to name the winner to
 * everyone — the amounts and dividend still tell each member what they owe this
 * month without revealing who took the pot.
 */
export function auctionResult(p: ResultParams & { showWinner?: boolean }): string {
  const lines = [
    p.dateText,
    `Chit no. ${p.monthNumber}/${p.tenureMonths}`,
  ]
  if (p.showWinner !== false) lines.push(`Winner- ${p.winnerName}`)
  lines.push(
    `Auction amount- ${Math.round(p.auctionAmount).toLocaleString('en-IN')}`,
    `Discount- ${Math.round(p.discount).toLocaleString('en-IN')}`,
    `Due amount- ${Math.round(p.dueAmount).toLocaleString('en-IN')}`,
  )
  return lines.join('\n')
}

export interface WinnerPayoutParams {
  dateText: string
  monthNumber: number
  tenureMonths: number
  winnerName: string
  winningAmount: number          // the payout (net of their bid)
  pendingAmount: number          // their own dues being deducted
  transferDays?: number          // default 7
}

/**
 * Message 3 — sent to the WINNER about their payout.
 *
 * Shows what they won, what's being deducted for their own dues, and the net that
 * will actually reach them, with a settlement window. This is the individual
 * counterpart to the broadcast result — the winner needs to know why they're
 * receiving less than the headline auction amount.
 */
export function winnerPayout(p: WinnerPayoutParams): string {
  const after = Math.max(0, Math.round((p.winningAmount - p.pendingAmount)))
  const days = p.transferDays ?? 7
  return [
    p.dateText,
    `Chit no. ${p.monthNumber}/${p.tenureMonths}`,
    `Winner- ${p.winnerName}`,
    `Winning amount- ${Math.round(p.winningAmount).toLocaleString('en-IN')}`,
    `Pending amount- ${Math.round(p.pendingAmount).toLocaleString('en-IN')}`,
    `After deduction- ${after.toLocaleString('en-IN')}`,
    `This will be transferred within the next ${days} days.`,
  ].join('\n')
}

/** A wa.me link that opens WhatsApp to this number with the message prefilled. */
export function whatsappLink(dialCode: string, phone: string, message: string): string {
  const num = `${(dialCode || '').replace(/\D/g, '')}${(phone || '').replace(/\D/g, '')}`
  return `https://wa.me/${num}?text=${encodeURIComponent(message)}`
}
