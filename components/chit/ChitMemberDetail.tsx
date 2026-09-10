'use client'

// One member, everything about them.
//
// The question this page answers is the one asked across a desk: how many chits
// is he in, what has he taken, what does he still owe? Every figure comes from
// recorded rows — dues raised, payments received, auctions held — so it matches
// the passbook the member is holding.

import Link from 'next/link'
import { ChevronLeft, Phone, MapPin, CreditCard, UserPlus, Users, ShieldCheck } from 'lucide-react'
import type { ChitMember, ChitContact } from '@/lib/chit/types'
import type { MemberSummary } from '@/lib/chit/memberSummary'

const inr = (n: number | null | undefined): string =>
  n == null ? '—' : '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN')

interface MemberRef { id: string; name: string; member_code: string | null }

export default function ChitMemberDetail({
  member, summary, referrer, referred,
}: {
  member: ChitMember
  summary: MemberSummary
  referrer: MemberRef | null
  referred: MemberRef[]
}) {
  return (
    <div className="w-full px-4 md:px-8 py-6 space-y-5">
      <Link href="/chit/members" className="inline-flex items-center gap-1 text-[12.5px]"
        style={{ color: 'var(--text-muted)' }}>
        <ChevronLeft className="w-3.5 h-3.5" /> All members
      </Link>

      {/* ── Who they are ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-xl md:text-2xl font-extrabold tracking-tight" style={{ color: 'var(--text)' }}>
              {member.name}
            </h1>
            {member.member_code && (
              <span className="text-[11px] font-extrabold px-2 py-0.5 rounded-full"
                style={{ color: 'var(--brand)', background: 'color-mix(in srgb, var(--brand) 12%, transparent)' }}>
                {member.member_code}
              </span>
            )}
            {!member.is_active && (
              <span className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-faint)' }}>inactive</span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-[12.5px]" style={{ color: 'var(--text-muted)' }}>
            {member.phone && <span className="inline-flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" />{member.phone}</span>}
            {member.pan && <span>PAN {member.pan}</span>}
            {member.aadhaar && <span>Aadhaar {member.aadhaar}</span>}
          </div>
          {member.address && (
            <p className="text-[12.5px] mt-1 inline-flex items-start gap-1.5" style={{ color: 'var(--text-muted)' }}>
              <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0" />{member.address}
            </p>
          )}
        </div>
      </div>

      {/* ── Where they stand ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Chits" value={String(summary.groupCount)}
          sub={`${summary.activeGroupCount} active`} />
        <Stat label="Paid in" value={inr(summary.totalPaid)}
          sub={`of ${inr(summary.totalBilled)} raised`} />
        <Stat
          label={summary.totalAdvance > 0 && summary.totalOwed === 0 ? 'In advance' : 'Owes'}
          value={inr(summary.totalOwed > 0 ? summary.totalOwed : summary.totalAdvance)}
          tone={summary.totalOwed > 0 ? 'var(--expense)' : 'var(--income)'}
          sub={summary.totalOverdue > 0 ? `${summary.totalOverdue} overdue` : 'nothing overdue'} />
        <Stat label="Prize taken" value={inr(summary.totalPrize)}
          sub={summary.prizeDue > 0 ? `${inr(summary.prizeDue)} awaiting payout` : `${summary.chitsWon} chit${summary.chitsWon === 1 ? '' : 's'} won`}
          tone={summary.chitsWon > 0 ? 'var(--brand)' : undefined} />
      </div>

      {/* ── Chit by chit ─────────────────────────────────────────────────── */}
      <Card title="Chits" icon={<Users className="w-3.5 h-3.5" />}>
        {summary.groups.length === 0 ? (
          <p className="text-[12.5px] py-2" style={{ color: 'var(--text-faint)' }}>
            Not in any chit group yet.
          </p>
        ) : (
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-[12.5px]" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ color: 'var(--text-faint)' }}>
                  <th className="text-left font-bold pb-2 px-1">Chit</th>
                  <th className="text-right font-bold pb-2 px-1">Paid</th>
                  <th className="text-right font-bold pb-2 px-1">Owes</th>
                  <th className="text-right font-bold pb-2 px-1">Dividends</th>
                  <th className="text-right font-bold pb-2 px-1">Prize</th>
                </tr>
              </thead>
              <tbody>
                {summary.groups.map(g => (
                  <tr key={g.groupId} style={{ borderTop: '1px solid var(--border)' }}>
                    <td className="py-2.5 px-1">
                      <Link href={`/chit/groups/${g.groupId}`} className="font-extrabold" style={{ color: 'var(--text)' }}>
                        {g.groupName}
                      </Link>
                      <p className="text-[11px]" style={{ color: 'var(--text-faint)' }}>
                        {inr(g.chitValue)}
                        {g.slotNumber != null ? ` · slot ${g.slotNumber}` : ''}
                        {` · ${g.monthsHeld} of ${g.totalMonths} months held`}
                      </p>
                    </td>
                    <td className="py-2.5 px-1 text-right" style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text-muted)' }}>
                      {inr(g.paid)}
                    </td>
                    <td className="py-2.5 px-1 text-right font-bold" style={{
                      fontVariantNumeric: 'tabular-nums',
                      color: g.overdueCount > 0 ? 'var(--expense)' : g.owed > 0 ? 'var(--amber)' : 'var(--income)',
                    }}>
                      {g.owed > 0 ? inr(g.owed) : g.advance > 0 ? `${inr(g.advance)} adv.` : '—'}
                    </td>
                    <td className="py-2.5 px-1 text-right" style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--income)' }}>
                      {inr(g.dividendsEarned)}
                    </td>
                    <td className="py-2.5 px-1 text-right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {g.hasWon ? (
                        <span style={{ color: g.prizePaid ? 'var(--brand)' : 'var(--amber)' }}>
                          {inr(g.prizeReceived)}
                          <span className="block text-[10px]">
                            month {g.wonMonth}{g.prizePaid ? '' : ' · unpaid'}
                          </span>
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-faint)' }}>not yet</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        {/* ── Bank ───────────────────────────────────────────────────────── */}
        <Card title="Bank account" icon={<CreditCard className="w-3.5 h-3.5" />}>
          {member.bank_account_number || member.bank_name ? (
            <div className="space-y-1">
              <Row label="Bank" value={[member.bank_name, member.bank_branch].filter(Boolean).join(', ') || '—'} />
              <Row label="Account name" value={member.bank_account_name ?? '—'} />
              <Row label="Account number" value={member.bank_account_number ?? '—'} />
              <Row label="IFSC" value={member.bank_ifsc ?? '—'} />
            </div>
          ) : (
            <p className="text-[12.5px] py-1" style={{ color: 'var(--text-faint)' }}>
              No bank details on file. Needed to pay their prize by transfer.
            </p>
          )}
        </Card>

        {/* ── References ─────────────────────────────────────────────────── */}
        <Card title="Introduced by" icon={<UserPlus className="w-3.5 h-3.5" />}>
          {referrer ? (
            <Link href={`/chit/members/${referrer.id}`} className="text-[13px] font-bold" style={{ color: 'var(--brand)' }}>
              {referrer.name}{referrer.member_code ? ` · ${referrer.member_code}` : ''}
            </Link>
          ) : (
            <p className="text-[12.5px]" style={{ color: 'var(--text-faint)' }}>Not recorded.</p>
          )}
          {referred.length > 0 && (
            <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
              <p className="text-[11px] uppercase tracking-wide font-extrabold mb-1.5" style={{ color: 'var(--text-faint)' }}>
                Introduced {referred.length} member{referred.length === 1 ? '' : 's'}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {referred.map(r => (
                  <Link key={r.id} href={`/chit/members/${r.id}`}
                    className="text-[11.5px] px-2 py-0.5 rounded-full"
                    style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}>
                    {r.name}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* ── The people and things standing behind them ───────────────────── */}
      <div className="grid md:grid-cols-2 gap-4">
        <ContactCard title="Securities" icon={<ShieldCheck className="w-3.5 h-3.5" />} items={member.securities}
          empty="No securities recorded." />
        <ContactCard title="Guarantors" icon={<ShieldCheck className="w-3.5 h-3.5" />} items={member.guarantors}
          empty="No guarantors recorded." />
        <ContactCard title="Nominees" icon={<Users className="w-3.5 h-3.5" />} items={member.nominees}
          empty="No nominees recorded." />
        <ContactCard title="Other references" icon={<UserPlus className="w-3.5 h-3.5" />} items={member.reference_contacts}
          empty="No other references recorded." />
      </div>

      {member.notes && (
        <Card title="Notes">
          <p className="text-[12.5px] leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--text-muted)' }}>
            {member.notes}
          </p>
        </Card>
      )}
    </div>
  )
}

// ── Small pieces ────────────────────────────────────────────────────────────

function Card({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <p className="text-[11px] uppercase tracking-wide font-extrabold mb-2 inline-flex items-center gap-1.5"
        style={{ color: 'var(--text-faint)' }}>
        {icon}{title}
      </p>
      {children}
    </div>
  )
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="rounded-2xl p-3.5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <p className="text-[11px] uppercase tracking-wide font-extrabold" style={{ color: 'var(--text-faint)' }}>{label}</p>
      <p className="text-lg font-extrabold mt-0.5" style={{ color: tone ?? 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{value}</p>
      {sub && <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-faint)' }}>{sub}</p>}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-[12px]" style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span className="text-[12.5px] font-bold text-right" style={{ color: 'var(--text)' }}>{value}</span>
    </div>
  )
}

function ContactCard({ title, icon, items, empty }: {
  title: string; icon?: React.ReactNode; items: ChitContact[] | null | undefined; empty: string
}) {
  const list = Array.isArray(items) ? items.filter(i => i && (i.name || i.detail || i.phone)) : []
  return (
    <Card title={title} icon={icon}>
      {list.length === 0 ? (
        <p className="text-[12.5px]" style={{ color: 'var(--text-faint)' }}>{empty}</p>
      ) : (
        <div className="space-y-1.5">
          {list.map((c, i) => (
            <div key={i} className="text-[12.5px]">
              <span className="font-bold" style={{ color: 'var(--text)' }}>{c.name || c.detail}</span>
              {c.relation && <span style={{ color: 'var(--text-faint)' }}> · {c.relation}</span>}
              {c.phone && <span style={{ color: 'var(--text-muted)' }}> · {c.phone}</span>}
              {c.name && c.detail && <p style={{ color: 'var(--text-muted)' }}>{c.detail}</p>}
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}
