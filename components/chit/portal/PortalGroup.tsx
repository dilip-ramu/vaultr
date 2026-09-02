'use client'

import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { Card, Row, StatusChip, inr, fmtDate } from './shared'
import PortalBidPanel from './PortalBidPanel'
import type { PortalGroupDetail, PortalLiveAuction } from '@/lib/chit/portal-data'

export default function PortalGroup({
  detail, groupId, auction,
}: { detail: PortalGroupDetail; groupId: string; auction: PortalLiveAuction | null }) {
  const { group: g, ledger, auctions } = detail
  const byMonth = new Map(auctions.map(a => [a.monthNumber, a]))

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
        <p className="text-[11.5px] uppercase tracking-wide font-extrabold mb-2"
          style={{ color: 'var(--text-faint)' }}>Your passbook</p>
        {ledger.length === 0 ? (
          <Card className="p-4">
            <p className="text-[12.5px]" style={{ color: 'var(--text-muted)' }}>
              No installments have been raised for you in this group yet.
            </p>
          </Card>
        ) : (
          <div className="space-y-2">
            {ledger.map(r => {
              const a = byMonth.get(r.monthNumber)
              return (
                <Card key={r.monthNumber} className="p-3.5">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[13px] font-extrabold">Month {r.monthNumber}</p>
                    <StatusChip status={r.status} />
                  </div>
                  <div className="mt-1.5">
                    <Row label="Amount due" value={inr(r.dueAmount)} />
                    <Row label="Due date" value={fmtDate(r.dueDate)} />
                    {r.paidDate && <Row label="Paid on" value={fmtDate(r.paidDate)} tone="var(--income)" />}
                    {/* The auction figures that PRODUCED this month's amount. A
                        member who cannot check the arithmetic has to take the
                        organiser's word for it. */}
                    {a && (
                      <>
                        <Row label="Winning discount" value={inr(a.discount)} />
                        <Row label="Dividend shared" value={inr(a.dividendPerMember)} tone="var(--income)" />
                        <Row label="Prize taken by"
                          value={a.wonByYou ? 'You' : (a.winnerName ?? 'Organiser')}
                          tone={a.wonByYou ? 'var(--brand)' : undefined} />
                        {a.wonByYou && <Row label="You received" value={inr(a.netPayout)} tone="var(--brand)" />}
                      </>
                    )}
                  </div>
                </Card>
              )
            })}
          </div>
        )}
      </div>

      <p className="text-[11px] leading-relaxed pt-2" style={{ color: 'var(--text-faint)' }}>
        Auction figures are shown so you can check how each month&apos;s amount was worked out.
        Other members&apos; payment details are not shown to anyone.
      </p>
    </div>
  )
}
