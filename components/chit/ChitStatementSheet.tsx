// The document ten partners read.
//
// Deliberately plain. No theme variables, no colour that carries meaning on its
// own, nothing that depends on a screen — this gets rasterised into a PDF and
// forwarded around WhatsApp, where it will be read on a cracked phone in
// sunlight. Black on white, real numbers, and the arithmetic shown rather than
// asserted.
//
// The order is the argument: what the balance is, then anything that needs
// explaining, then the chit activity that caused it, then every single line so
// the reader can check the claim for themselves.

import type { ChitStatement } from '@/lib/chit/statement'
import { money, dmy } from '@/lib/chit/statement'

const INK = '#111111'
const MUTED = '#6b6b6b'
const RULE = '#dcdcdc'
const IN = '#15803d'
const OUT = '#b91c1c'

const KIND_LABEL: Record<string, string> = {
  collection: 'Collection',
  payout: 'Payout',
  other: 'Other',
}

export default function ChitStatementSheet({
  statement, businessName, generatedOn,
}: {
  statement: ChitStatement
  businessName: string
  generatedOn: string
}) {
  const s = statement
  const hasOther = s.lines.some(l => l.kind === 'other')

  return (
    <div
      id="chit-statement-sheet"
      style={{
        width: 794, minHeight: 1123, background: '#ffffff', color: INK,
        padding: '48px 52px', boxSizing: 'border-box',
        fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif',
        fontSize: 12, lineHeight: 1.5,
      }}
    >
      {/* ── Masthead ─────────────────────────────────────────────────────── */}
      <div style={{ borderBottom: `2px solid ${INK}`, paddingBottom: 14, marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <p style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em' }}>
              {businessName}
            </p>
            <p style={{ margin: '2px 0 0', fontSize: 13, fontWeight: 600, color: MUTED }}>
              Chit fund statement &middot; {s.accountName}
            </p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>{s.periodLabel}</p>
            <p style={{ margin: '2px 0 0', fontSize: 10.5, color: MUTED }}>
              {dmy(s.periodStart)} – {dmy(s.periodEnd)}
            </p>
          </div>
        </div>
      </div>

      {/* ── The balance, with its arithmetic on show ─────────────────────── */}
      <Section title="The balance" />
      <div style={{ border: `1px solid ${RULE}`, borderRadius: 6, overflow: 'hidden', marginBottom: 6 }}>
        <BalanceRow label={`Opening balance on ${dmy(s.periodStart)}`} value={money(s.opening)} />
        <BalanceRow label="Money in" value={`+ ${money(s.moneyIn)}`} colour={IN} />
        <BalanceRow label="Money out" value={`− ${money(s.moneyOut)}`} colour={OUT} />
        <BalanceRow
          label={`Closing balance on ${dmy(s.periodEnd)}`}
          value={money(s.closing)} strong
        />
      </div>
      <p style={{ margin: '0 0 6px', fontSize: 10.5, color: MUTED }}>
        {money(s.opening)} + {money(s.moneyIn)} − {money(s.moneyOut)} = {money(s.closing)}.
        Every figure below is a sum of transactions in the {s.accountName} account and can be
        checked line by line against the bank&rsquo;s own statement.
      </p>

      {s.recordedBalance != null && (
        <p style={{
          margin: '0 0 16px', fontSize: 11, fontWeight: 600,
          color: s.difference === 0 ? IN : OUT,
        }}>
          {s.difference === 0
            ? `Cross-check: the balance held in the system is ${money(s.recordedBalance)}. It matches.`
            : `Cross-check: the balance held in the system is ${money(s.recordedBalance)} — a difference of ${money(Math.abs(s.difference ?? 0))}.`}
        </p>
      )}
      {s.recordedBalance == null && <div style={{ height: 10 }} />}

      {/* ── Where the money came from and went ──────────────────────────── */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        <Stat label="Collections received" value={money(s.collectionsIn)} colour={IN} />
        <Stat label="Payouts made" value={money(s.payoutsOut)} colour={OUT} />
        <Stat label="Other money in" value={money(s.otherIn)} colour={s.otherIn ? IN : MUTED} />
        <Stat label="Other money out" value={money(s.otherOut)} colour={s.otherOut ? OUT : MUTED} />
      </div>

      {/* ── Anything a reader should not have to work out ───────────────── */}
      {s.notes.length > 0 && (
        <>
          <Section title="Notes" />
          <div style={{
            border: `1px solid ${RULE}`, borderLeft: `3px solid ${INK}`,
            borderRadius: 4, padding: '10px 12px', marginBottom: 22,
          }}>
            {s.notes.map((n, i) => (
              <p key={i} style={{ margin: i ? '7px 0 0' : 0, fontSize: 11.5 }}>{n}</p>
            ))}
          </div>
        </>
      )}

      {/* ── The chits themselves ────────────────────────────────────────── */}
      <Section title="Chit groups this period" />
      {s.groups.length === 0 && (
        <p style={{ fontSize: 11.5, color: MUTED, marginTop: 0 }}>No chit groups on the books.</p>
      )}
      {s.groups.map(g => (
        <div key={g.id} style={{
          border: `1px solid ${RULE}`, borderRadius: 6, padding: '12px 14px', marginBottom: 10,
          breakInside: 'avoid',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <p style={{ margin: 0, fontSize: 13.5, fontWeight: 800 }}>{g.name}</p>
            <p style={{ margin: 0, fontSize: 10.5, color: MUTED }}>
              Pot {money(g.chitValue)} &middot; {g.membersOnRoster} of {g.membersPlanned} members
              &middot; installment {money(g.installment)}
            </p>
          </div>

          {g.auction ? (
            <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px dashed ${RULE}` }}>
              <p style={{ margin: 0, fontSize: 11.5 }}>
                <b>Month {g.auction.monthNumber} auction</b> held {dmy(g.auction.date)} —
                won by <b>{g.auction.winner}</b>.
              </p>
              <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 6, fontSize: 11 }}>
                <tbody>
                  <Cells cells={[
                    ['Winning discount', money(g.auction.bid)],
                    ['Commission', money(g.auction.commission)],
                    ['Dividend per member', money(g.auction.dividendPerMember)],
                    ['Paid to winner', money(g.auction.netPayout) + (g.auction.paid ? '' : ' — NOT YET PAID')],
                  ]} />
                </tbody>
              </table>
            </div>
          ) : (
            <p style={{ margin: '8px 0 0', fontSize: 11.5, color: MUTED }}>
              No auction held in this period.
            </p>
          )}

          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 8, fontSize: 11 }}>
            <tbody>
              <Cells cells={[
                ['Collections received', `${money(g.collectionTotal)} from ${g.collectionCount} payment${g.collectionCount === 1 ? '' : 's'}`],
                ['Paid out', money(g.payoutTotal)],
                ['Still owed at period end',
                  g.outstanding > 0
                    ? `${money(g.outstanding)} across ${g.outstandingCount} unpaid installment${g.outstandingCount === 1 ? '' : 's'}`
                    : 'Nothing — every installment due has been received'],
              ]} />
            </tbody>
          </table>
        </div>
      ))}

      {/* ── Every line ──────────────────────────────────────────────────── */}
      <div style={{ marginTop: 22 }}>
        <Section title={`Every transaction in ${s.accountName}`} />
      </div>
      {s.lines.length === 0 ? (
        <p style={{ fontSize: 11.5, color: MUTED, marginTop: 0 }}>
          Nothing moved through the account in this period.
        </p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10.8 }}>
          <thead>
            <tr style={{ borderBottom: `1.5px solid ${INK}` }}>
              <Th w={62}>Date</Th>
              <Th>Description</Th>
              <Th w={70}>Type</Th>
              <Th w={82} right>In</Th>
              <Th w={82} right>Out</Th>
              <Th w={92} right>Balance</Th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <Td colSpan={5} muted>Opening balance</Td>
              <Td right strong>{money(s.opening)}</Td>
            </tr>
            {s.lines.map(l => (
              <tr key={l.id} style={{ borderTop: `1px solid ${RULE}` }}>
                <Td>{dmy(l.date)}</Td>
                <Td>{l.description}</Td>
                <Td>
                  <span style={{
                    fontSize: 9.5, fontWeight: 700, padding: '1px 5px', borderRadius: 3,
                    border: `1px solid ${l.kind === 'other' ? INK : RULE}`,
                    background: l.kind === 'other' ? '#f2f2f2' : 'transparent',
                  }}>
                    {KIND_LABEL[l.kind]}
                  </span>
                </Td>
                <Td right colour={IN}>{l.effect > 0 ? money(l.effect) : ''}</Td>
                <Td right colour={OUT}>{l.effect < 0 ? money(l.effect) : ''}</Td>
                <Td right>{money(l.running)}</Td>
              </tr>
            ))}
            <tr style={{ borderTop: `1.5px solid ${INK}` }}>
              <Td colSpan={3} strong>Closing balance on {dmy(s.periodEnd)}</Td>
              <Td right strong colour={IN}>{money(s.moneyIn)}</Td>
              <Td right strong colour={OUT}>{money(s.moneyOut)}</Td>
              <Td right strong>{money(s.closing)}</Td>
            </tr>
          </tbody>
        </table>
      )}

      {hasOther && (
        <p style={{ marginTop: 10, fontSize: 10.5, color: MUTED }}>
          Lines marked <b>Other</b> are movements in this account that are not chit collections or
          chit payouts. They are shown so they can be asked about.
        </p>
      )}

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <div style={{ marginTop: 28, paddingTop: 10, borderTop: `1px solid ${RULE}`, color: MUTED, fontSize: 10 }}>
        <p style={{ margin: 0 }}>
          Prepared {generatedOn} from the {s.accountName} account ledger. Figures are computed from
          transaction records, not entered by hand. Any partner who spots a line that does not match
          the bank statement should raise it — that is what this document is for.
        </p>
      </div>
    </div>
  )
}

/* ── Small pieces ─────────────────────────────────────────────────────────── */

function Section({ title }: { title: string }) {
  return (
    <p style={{
      margin: '0 0 8px', fontSize: 10, fontWeight: 800, letterSpacing: '0.09em',
      textTransform: 'uppercase', color: MUTED,
    }}>{title}</p>
  )
}

function BalanceRow({ label, value, colour, strong }: {
  label: string; value: string; colour?: string; strong?: boolean
}) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', padding: '8px 12px',
      borderTop: strong ? `1.5px solid ${INK}` : `1px solid ${RULE}`,
      background: strong ? '#fafafa' : 'transparent',
    }}>
      <span style={{ fontSize: 11.5, fontWeight: strong ? 800 : 500 }}>{label}</span>
      <span style={{
        fontSize: strong ? 14 : 12, fontWeight: strong ? 800 : 600,
        color: colour ?? INK, fontVariantNumeric: 'tabular-nums',
      }}>{value}</span>
    </div>
  )
}

function Stat({ label, value, colour }: { label: string; value: string; colour: string }) {
  return (
    <div style={{ flex: 1, border: `1px solid ${RULE}`, borderRadius: 6, padding: '9px 11px' }}>
      <p style={{ margin: 0, fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: MUTED }}>
        {label}
      </p>
      <p style={{ margin: '3px 0 0', fontSize: 14, fontWeight: 800, color: colour, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </p>
    </div>
  )
}

function Cells({ cells }: { cells: [string, string][] }) {
  return (
    <>
      {cells.map(([k, v]) => (
        <tr key={k}>
          <td style={{ padding: '2px 0', color: MUTED, width: '42%' }}>{k}</td>
          <td style={{ padding: '2px 0', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{v}</td>
        </tr>
      ))}
    </>
  )
}

function Th({ children, w, right }: { children?: React.ReactNode; w?: number; right?: boolean }) {
  return (
    <th style={{
      width: w, textAlign: right ? 'right' : 'left', padding: '5px 4px',
      fontSize: 9.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: MUTED,
    }}>{children}</th>
  )
}

function Td({ children, right, strong, muted, colour, colSpan }: {
  children?: React.ReactNode; right?: boolean; strong?: boolean; muted?: boolean
  colour?: string; colSpan?: number
}) {
  return (
    <td colSpan={colSpan} style={{
      padding: '4px', textAlign: right ? 'right' : 'left',
      fontWeight: strong ? 700 : 400, color: muted ? MUTED : (colour ?? INK),
      fontVariantNumeric: 'tabular-nums', verticalAlign: 'top',
    }}>{children}</td>
  )
}
