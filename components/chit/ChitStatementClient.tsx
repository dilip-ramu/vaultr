'use client'

// Pick a month, look at it, download it, send it.
//
// The preview is the real document at real size, scaled down to fit the screen.
// What you see is what the partners get — there is no second rendering path
// that could drift from the PDF.

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Download, FileText, AlertTriangle } from 'lucide-react'
import ChitStatementSheet from './ChitStatementSheet'
import type { ChitStatement, Period } from '@/lib/chit/statement'
import { notify } from '@/components/shared/Toast'

export default function ChitStatementClient({
  months, selectedKey, statement, businessName, missingAccount, knownAccounts,
}: {
  months: Period[]
  selectedKey: string
  statement: ChitStatement | null
  businessName: string
  missingAccount?: string
  knownAccounts?: string[]
}) {
  const router = useRouter()
  const sheetRef = useRef<HTMLDivElement>(null)
  const [busy, setBusy] = useState(false)

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
            One month of the {businessName} account, ready to send to the partners.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={selectedKey}
            onChange={e => router.push(`/chit/statement?m=${e.target.value}`)}
            className="text-[13px] font-bold px-3 py-2 rounded-xl"
            style={{ border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}
          >
            {months.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select>
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
