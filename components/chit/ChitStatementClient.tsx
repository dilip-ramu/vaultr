'use client'

// Pick a period, look at it, download it, send it.
//
// A whole month is the normal case — that is what goes out on the 1st — so it
// is the default and stays one click. Two dates are there for the other
// question, the one that starts "what happened between the auction and the
// payout", and they are deliberately a second mode rather than the only mode:
// hand-picked dates can overlap or leave gaps between statements, and that is
// fine for a one-off and wrong for the monthly.
//
// The preview is the real document at real size, scaled down to fit the screen.
// What you see is what the partners get — there is no second rendering path
// that could drift from the PDF.

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Download, FileText, AlertTriangle, CalendarRange, CalendarDays } from 'lucide-react'
import ChitStatementSheet from './ChitStatementSheet'
import type { ChitStatement, Period } from '@/lib/chit/statement'
import { notify } from '@/components/shared/Toast'

export default function ChitStatementClient({
  months, selectedKey, statement, businessName, missingAccount, knownAccounts,
  periodStart, periodEnd, rangeError,
}: {
  months: Period[]
  selectedKey: string
  statement: ChitStatement | null
  businessName: string
  missingAccount?: string
  knownAccounts?: string[]
  /** What is on screen now, so the date boxes open on it rather than empty. */
  periodStart: string
  periodEnd: string
  rangeError?: string | null
}) {
  const router = useRouter()
  const sheetRef = useRef<HTMLDivElement>(null)
  const [busy, setBusy] = useState(false)

  // A range is showing when the dates are not a whole month, or when the one
  // that was asked for was refused — in which case the boxes must stay open so
  // the mistake can be corrected rather than vanishing.
  const isWholeMonth = months.some(m => m.start === periodStart && m.end === periodEnd)
  const [byRange, setByRange] = useState(!isWholeMonth || Boolean(rangeError))
  const [from, setFrom] = useState(periodStart)
  const [to, setTo] = useState(periodEnd)

  function showRange() {
    router.push(`/chit/statement?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
  }

  const generatedOn = new Date().toLocaleDateString('en-IN', {
    day: 'numeric', month: 'long', year: 'numeric',
  })

  async function download() {
    const host = sheetRef.current
    const el = host?.firstElementChild as HTMLElement | null
    if (!el || !statement) return
    setBusy(true)
    try {
      const { downloadElementPdf } = await import('@/lib/pdf/downloadElementPdf')
      await downloadElementPdf(el, `Chit statement — ${statement.periodLabel}`)
    } catch {
      notify('Could not build the PDF. Try again.', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="w-full px-4 md:px-8 py-6 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-extrabold tracking-tight" style={{ color: 'var(--text)' }}>
            Partner statement
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
            The {businessName} account, ready to send to the partners.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {byRange ? (
            <div className="flex items-center gap-1.5">
              <input type="date" value={from} max={to || undefined}
                onChange={e => setFrom(e.target.value)}
                className="text-[13px] font-bold px-2.5 py-2 rounded-xl"
                style={{ border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }} />
              <span className="text-[12px]" style={{ color: 'var(--text-faint)' }}>to</span>
              <input type="date" value={to} min={from || undefined}
                onChange={e => setTo(e.target.value)}
                className="text-[13px] font-bold px-2.5 py-2 rounded-xl"
                style={{ border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }} />
              <button onClick={showRange} disabled={!from || !to}
                className="text-[13px] font-bold px-3 py-2 rounded-xl disabled:opacity-40"
                style={{ border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                Show
              </button>
            </div>
          ) : (
            <select
              value={selectedKey}
              onChange={e => router.push(`/chit/statement?m=${e.target.value}`)}
              className="text-[13px] font-bold px-3 py-2 rounded-xl"
              style={{ border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}
            >
              {months.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
            </select>
          )}

          <button
            onClick={() => setByRange(v => !v)}
            title={byRange ? 'Pick a whole month instead' : 'Pick any two dates instead'}
            className="flex items-center gap-1.5 text-[13px] font-bold px-3 py-2 rounded-xl"
            style={{ border: '1px solid var(--border)', color: 'var(--text-muted)' }}
          >
            {byRange ? <CalendarDays className="w-4 h-4" /> : <CalendarRange className="w-4 h-4" />}
            {byRange ? 'Month' : 'Dates'}
          </button>
          <button
            onClick={download}
            disabled={busy || !statement}
            className="flex items-center gap-2 text-white text-sm font-bold px-4 py-2 rounded-xl disabled:opacity-50"
            style={{ background: 'var(--brand)' }}
          >
            <Download className="w-4 h-4" />
            {busy ? 'Building…' : 'Download PDF'}
          </button>
        </div>
      </div>

      {rangeError && (
        <div className="rounded-2xl p-4" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
          <p className="text-[13px] font-bold" style={{ color: 'var(--expense)' }}>{rangeError}</p>
          <p className="text-[12.5px] mt-1" style={{ color: 'var(--text-muted)' }}>
            The statement below is still showing {statement?.periodLabel ?? 'the last full month'}.
          </p>
        </div>
      )}

      {missingAccount && (
        <div className="rounded-2xl p-5" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
          <p className="text-sm font-bold flex items-center gap-2" style={{ color: 'var(--text)' }}>
            <AlertTriangle className="w-4 h-4" style={{ color: 'var(--amber)' }} />
            No account named &ldquo;{missingAccount}&rdquo;
          </p>
          <p className="text-[12.5px] mt-1.5 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            This statement is built from one account only, matched by name. Rename the chit account
            to <b>{missingAccount}</b> in Accounts and it will appear here.
          </p>
          {knownAccounts && knownAccounts.length > 0 && (
            <p className="text-[12px] mt-2" style={{ color: 'var(--text-faint)' }}>
              Accounts found: {knownAccounts.join(', ')}
            </p>
          )}
        </div>
      )}

      {statement && (
        <>
          <div className="rounded-2xl p-4 flex flex-wrap items-center gap-x-5 gap-y-1"
            style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
            <p className="text-[11px] uppercase tracking-wide font-extrabold inline-flex items-center gap-1.5"
              style={{ color: 'var(--text-faint)' }}>
              <FileText className="w-3.5 h-3.5" /> Before you send it
            </p>
            <p className="text-[12.5px]" style={{ color: 'var(--text-muted)' }}>
              {statement.notes.length === 0
                ? 'Nothing needs explaining this month.'
                : `${statement.notes.length} note${statement.notes.length === 1 ? '' : 's'} on the statement — read ${statement.notes.length === 1 ? 'it' : 'them'} first.`}
            </p>
          </div>

          {/* The document, real size, scaled to fit. */}
          <div className="overflow-x-auto">
            <div
              ref={sheetRef}
              style={{ width: 794, boxShadow: '0 1px 3px rgba(0,0,0,.18)' }}
            >
              <ChitStatementSheet
                statement={statement}
                businessName={businessName}
                generatedOn={generatedOn}
              />
            </div>
          </div>
        </>
      )}
    </div>
  )
}
