'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, ArrowUpDown, Trophy } from 'lucide-react'
import { Card, Row, StatusChip, inr, fmtDate } from './shared'
import PortalBidPanel from './PortalBidPanel'
import type { PortalGroupDetail, PortalLiveAuction } from '@/lib/chit/portal-data'

export default function PortalGroup({
  detail, groupId, auction,
}: { detail: PortalGroupDetail; groupId: string; auction: PortalLiveAuction | null }) {
  const { group: g, ledger, auctions } = detail
  const byMonth = new Map(auctions.map(a => [a.monthNumber, a]))
  // Newest first by default: the month somebody opens their passbook to check
  // is almost always the one just gone, not the one five years ago.
  const [newestFirst, setNewestFirst] = useState(true)
  const months = [...ledger].sort((a, b) =>
    newestFirst ? b.monthNumber - a.monthNumber : a.monthNumber - b.monthNumber)

  return (
    <div className="pt-8 space-y-4">
      <Link href="/m" className="inline-flex items-center gap-1 text-[12.5px]"
        style={{ color: 'var(--text-muted)' }}>
        <ChevronLeft className="w-3.5 h-3.5" /> All groups
      </Link>

      <div>
        <h1 className="text-xl font-extrabold leading-tight">{g.name}</h1>
        <p className="text-[12px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
          {inr(g.chitValue)} over {g.tenureMonths} months
          {g.slotNumber != null ? ` · your slot ${g.slotNumber}` : ''}
        </p>
      </div>

      {/* The live auction sits ABOVE the passbook while it is running: if
          bidding is open, that is the only thing the member came for. */}
      {auction && auction.status === 'open' && (
        <PortalBidPanel groupId={groupId} initial={auction} />
      )}

      <Card className="p-4">
        <Row label="Monthly installment" value={inr(g.monthlyInstallment)} />
        <Row label="Paid so far" value={inr(g.totalPaid)} tone="var(--income)" />
        <Row label="Outstanding" value={inr(g.outstanding)}
          tone={g.overdueCount > 0 ? 'var(--expense)' : g.outstanding > 0 ? 'var(--amber)' : 'var(--income)'} />
        <Row label="Started" value={fmtDate(g.startDate)} />
      </Card>

      {/* ── The passbook. Their months, their money. ──────────────────────── */}
      <div>
        <div className="flex items-center justify-between gap-3 mb-2">
          <p className="text-[11.5px] uppercase tracking-wide font-extrabold"
            style={{ color: 'var(--text-faint)' }}>Your passbook</p>
          {ledger.length > 1 && (
            <button onClick={() => setNewestFirst(v => !v)}
              className="inline-flex items-center gap-1 text-[11.5px] font-bold"
              style={{ color: 'var(--brand)' }}>
              <ArrowUpDown className="w-3.5 h-3.5" />
              {newestFirst ? 'Newest first' : 'Oldest first'}
            </button>
          )}
        </div>

        {ledger.length === 0 ? (
          <Card className="p-4">
            <p className="text-[12.5px]" style={{ color: 'var(--text-muted)' }}>
              No installments have been raised for you in this group yet.
            </p>
          </Card>
        ) : (
          <div className="space-y-1.5">
            {months.map(r => {
              const a = byMonth.get(r.monthNumber)
              const won = Boolean(a?.wonByYou)
              return (
                <Card key={r.monthNumber} className="px-3 py-2.5"
                  // The month they took the chit is the one they will look
                  // for, so it is marked rather than left to be counted to.
                  style={won ? {
                    borderColor: 'var(--brand)',
                    background: 'color-mix(in srgb, var(--brand) 6%, var(--surface))',
                  } : undefined}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex items-baseline gap-2">
                      <p className="text-[13px] font-extrabold shrink-0">Month {r.monthNumber}</p>
                      {a?.auctionDate && (
                        <span className="text-[11px]" style={{ color: 'var(--text-faint)' }}>
                          auction {fmtDate(a.auctionDate)}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {won && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-extrabold px-1.5 py-0.5 rounded-full"
                          style={{ color: 'var(--brand)', background: 'color-mix(in srgb, var(--brand) 14%, transparent)' }}>
                          <Trophy className="w-3 h-3" /> You won
                        </span>
                      )}
                      <StatusChip status={r.status} />
                    </div>
                  </div>

                  {/* Two columns rather than a stack: the same figures in half
                      the height, which is what makes a long passbook readable. */}
                  <div className="grid grid-cols-2 gap-x-4 mt-1">
                    <Row compact label="Due" value={inr(r.dueAmount)} />
                    <Row compact label="By" value={fmtDate(r.dueDate)} />
                    {r.paidDate && <Row compact label="Paid" value={fmtDate(r.paidDate)} tone="var(--income)" />}
                    {r.paidAmount != null && <Row compact label="Amount" value={inr(r.paidAmount)} tone="var(--income)" />}
                    {a && <Row compact label="Discount" value={inr(a.discount)} />}
                    {a && <Row compact label="Dividend" value={inr(a.dividendPerMember)} tone="var(--income)" />}
                    {won && <Row compact label="You received" value={inr(a!.netPayout)} tone="var(--brand)" />}
                  </div>
                </Card>
              )
            })}
          </div>
        )}
      </div>

      <p className="text-[11px] leading-relaxed pt-2" style={{ color: 'var(--text-faint)' }}>
        Auction figures are shown so you can check how each month&apos;s amount was worked out.
        Who took the chit each month is not shown, and neither are anybody else&apos;s payments.
      </p>
    </div>
  )
}
