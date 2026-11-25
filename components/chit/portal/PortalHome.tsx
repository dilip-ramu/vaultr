'use client'

import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { Card, Row, inr, fmtDate, SignOut } from './shared'
import type { PortalMember, PortalGroupSummary } from '@/lib/chit/portal-data'

export default function PortalHome({
  member, groups,
}: { member: PortalMember; groups: PortalGroupSummary[] }) {
  const outstanding = groups.reduce((s, g) => s + g.outstanding, 0)
  const overdue = groups.reduce((s, g) => s + g.overdueCount, 0)

  return (
    <div className="pt-8 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>Signed in as</p>
          <h1 className="text-xl font-extrabold leading-tight">{member.name}</h1>
          <p className="text-[11.5px] mt-0.5" style={{ color: 'var(--text-faint)' }}>
            {[member.memberCode, member.phoneMasked].filter(Boolean).join(' · ')}
          </p>
          <Link href="/m/profile" className="inline-flex items-center gap-1 text-[12px] font-bold mt-1"
            style={{ color: 'var(--brand)' }}>
            Your details <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>
        <div className="pt-1"><SignOut /></div>
      </div>

      {groups.length === 0 ? (
        <Card className="p-5 text-center">
          <p className="text-[13px] font-bold">You are not in any chit group yet</p>
          <p className="text-[12.5px] mt-1.5 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            Once the organiser adds you to a group, it will appear here with your dues and payments.
          </p>
        </Card>
      ) : (
        <>
          <Card className="p-4">
            <p className="text-[11.5px] uppercase tracking-wide font-extrabold"
              style={{ color: 'var(--text-faint)' }}>Your position</p>
            <div className="mt-2">
              <Row label="Outstanding" value={inr(outstanding)}
                tone={outstanding > 0 ? 'var(--amber)' : 'var(--income)'} />
              <Row label="Groups" value={String(groups.length)} />
              {overdue > 0 && (
                <Row label="Overdue installments" value={String(overdue)} tone="var(--expense)" />
              )}
            </div>
          </Card>

          <div className="space-y-2.5">
            {groups.map(g => (
              <Link key={g.groupId} href={`/m/g/${g.groupId}`} className="block">
                <Card className="p-4 active:opacity-80">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[14px] font-extrabold truncate">{g.name}</p>
                      <p className="text-[11.5px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                        {inr(g.chitValue)} · {g.members} members
                        {g.slotNumber != null ? ` · your slot ${g.slotNumber}` : ''}
                      </p>
                    </div>
                    <ChevronRight className="w-4 h-4 mt-1 shrink-0" style={{ color: 'var(--text-faint)' }} />
                  </div>
                  <div className="mt-2.5 pt-2.5" style={{ borderTop: '1px solid var(--border)' }}>
                    <Row label="Outstanding" value={inr(g.outstanding)}
                      tone={g.overdueCount > 0 ? 'var(--expense)' : g.outstanding > 0 ? 'var(--amber)' : 'var(--income)'} />
                    <Row label="Next due" value={fmtDate(g.nextDueDate)} />
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </>
      )}

      <p className="text-[11px] leading-relaxed pt-2" style={{ color: 'var(--text-faint)' }}>
        This page shows your own chit account only. If a figure here does not match your
        records, speak to the chit organiser — this is a statement, not a receipt.
      </p>

      <p className="text-[12px] text-center px-4 pb-6" style={{ color: 'var(--text-muted)' }}>
        Please always include your member number
        {member.memberCode ? <b> ({member.memberCode})</b> : null} when you contact us.
      </p>
    </div>
  )
}
