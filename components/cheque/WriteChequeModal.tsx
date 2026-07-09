'use client'

import { useEffect, useMemo, useState } from 'react'
import { X, Printer, Check, Plus, Trash2, User } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { notify } from '@/components/shared/Toast'
import type { Bank, ChequeFieldKey } from '@/lib/cheque/types'
import { MM_TO_PX, AC_PAYEE_TEXT, dateDigitFor } from '@/lib/cheque/types'
import { amountInWords } from '@/lib/cheque/amountWords'
import { renderChequePdfBlob, chequeValuesFrom } from '@/lib/cheque/pdf'

interface Props {
  accounts: { id: string; name: string }[]
  onClose: () => void
  onDone?: () => void
}

const PT_TO_PX = 96 / 72
let lineSeq = 0

interface Line { id: number; name: string; amount: string; kind: 'expense' | 'transfer'; toAccountId: string }

export default function WriteChequeModal({ accounts, onClose, onDone }: Props) {
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '')
  const [payee, setPayee] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [chequeNumber, setChequeNumber] = useState('')
  const [acPayee, setAcPayee] = useState(true)
  const [bankTpl, setBankTpl] = useState<Bank | null>(null)
  const [lines, setLines] = useState<Line[]>([{ id: ++lineSeq, name: '', amount: '', kind: 'expense', toAccountId: '' }])
  const [blob, setBlob] = useState<Blob | null>(null)
  const [busy, setBusy] = useState(false)
  const [printed, setPrinted] = useState(false)

  const amt = parseFloat(amount) || 0
  const words = useMemo(() => amountInWords(amt), [amt])
  const linesTotal = lines.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0)
  const remaining = Math.round((amt - linesTotal) * 100) / 100

  // Fetch the selected account's cheque template.
  useEffect(() => {
    if (!accountId) { setBankTpl(null); return }
    let live = true
    const supabase = createClient()
    ;(async () => {
      const { data: acc } = await supabase.from('accounts').select('bank_id').eq('id', accountId).maybeSingle()
      if (!acc?.bank_id) { if (live) setBankTpl(null); return }
      const { data: bank } = await supabase.from('banks').select('*').eq('id', acc.bank_id).maybeSingle()
      if (live) setBankTpl(((bank as Bank) && bank!.cheque_width_mm) ? (bank as Bank) : null)
    })()
    return () => { live = false }
  }, [accountId])

  const values = chequeValuesFrom({ payee, amount: amt, dateIso: date, acPayee, chequeNumber })
  const [dd, mm, yyyy] = [values.dd, values.mm, values.yyyy]
  const valueFor = (k: ChequeFieldKey): string | null => {
    switch (k) {
      case 'payee': return values.payee
      case 'amount_figures': return values.amountFigures
      case 'amount_words': return values.amountWords
      case 'ac_payee': return acPayee ? AC_PAYEE_TEXT : null
      default: return dateDigitFor(k, dd, mm, yyyy)
    }
  }

  async function makeBlob(): Promise<Blob | null> {
    if (!bankTpl) return null
    const b = await renderChequePdfBlob(bankTpl, values)
    setBlob(b)
    return b
  }

  async function handlePrint() {
    if (!bankTpl) { notify('This account is not linked to a bank with a cheque template.', 'info'); return }
    setBusy(true)
    try {
      const b = await makeBlob()
      if (!b) return
      const url = URL.createObjectURL(b)
      const win = window.open(url, '_blank')
      if (win) win.addEventListener('load', () => { try { win.focus(); win.print() } catch { /* manual */ } })
      else notify('Allow pop-ups to open the print dialog, or download from the new tab.', 'info')
      setPrinted(true)
    } catch (e) { notify('Could not generate the cheque PDF: ' + (e as Error).message, 'error') }
    finally { setBusy(false) }
  }

  const setLine = (id: number, patch: Partial<Line>) => setLines(prev => prev.map(l => l.id === id ? { ...l, ...patch } : l))
  const addLine = () => setLines(prev => [...prev, { id: ++lineSeq, name: prev.length === 0 ? payee : '', amount: '', kind: 'expense', toAccountId: '' }])
  const fillRemainingInto = (id: number) => setLine(id, { amount: String(Math.max(0, remaining + (parseFloat(lines.find(l => l.id === id)?.amount || '0') || 0))) })

  async function handleRecord() {
    if (!accountId) { notify('Pick an account', 'info'); return }
    const valid = lines.filter(l => (parseFloat(l.amount) || 0) > 0 && (l.kind === 'transfer' ? !!l.toAccountId : !!l.name.trim()))
    if (valid.length === 0) { notify('Add at least one line: an expense (name + amount) or a transfer (target + amount).', 'info'); return }
    if (amt > 0 && Math.abs(remaining) > 0.01) { notify(`Lines must add up to the cheque amount. Off by ₹${Math.abs(remaining).toFixed(2)}.`, 'info'); return }

    setBusy(true)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      let pdfPath: string | null = null
      const b = blob ?? await makeBlob()
      if (b) {
        const path = `${user.id}/cheques/manual-${Date.now()}.pdf`
        const { error } = await supabase.storage.from('vaultr-attachments').upload(path, b, { contentType: 'application/pdf', upsert: true })
        if (!error) pdfPath = path
      }

      const rows: Record<string, unknown>[] = valid.map(l => {
        const base = {
          user_id: user.id, account_id: accountId, amount: parseFloat(l.amount) || 0, date,
          cheque_number: chequeNumber || null, cheque_pdf_path: pdfPath,
        }
        if (l.kind === 'transfer') {
          const tgt = accounts.find(a => a.id === l.toAccountId)
          return { ...base, type: 'transfer', to_account_id: l.toAccountId, name: l.name.trim() || `Transfer to ${tgt?.name ?? ''}`.trim() }
        }
        return { ...base, type: 'expense', name: l.name.trim() }
      })
      const { data: inserted, error: txErr } = await supabase.from('transactions').insert(rows).select('id')
      if (txErr) { notify(txErr.message, 'error'); return }

      if (pdfPath && inserted?.length) {
        await supabase.from('attachments').insert(inserted.map(t => ({
          user_id: user.id, transaction_id: (t as { id: string }).id,
          file_path: pdfPath!, file_name: `Cheque ${chequeNumber || ''}`.trim() + '.pdf',
          file_size: null, content_type: 'application/pdf',
        })))
      }
      notify(`Recorded ${rows.length} transaction${rows.length > 1 ? 's' : ''} ✓`, 'success')
      onDone?.(); onClose()
    } finally { setBusy(false) }
  }

  const wMm = bankTpl?.cheque_width_mm || 200
  const hMm = bankTpl?.cheque_height_mm || 92
  const scale = Math.min(1, 560 / (wMm * MM_TO_PX))
  const fields = bankTpl && Array.isArray(bankTpl.cheque_fields) ? bankTpl.cheque_fields : []

  const inputCls = 'w-full px-3 py-2 rounded-lg border text-sm'
  const inputStyle = { background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full max-w-3xl rounded-2xl overflow-hidden flex flex-col max-h-[92vh]" style={{ background: 'var(--surface)' }}>
        <div className="flex items-center justify-between px-5 py-3 border-b shrink-0" style={{ borderColor: 'var(--border)' }}>
          <div>
            <p className="font-extrabold" style={{ color: 'var(--text)' }}>Write a cheque</p>
            <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>Self or name cheque — no bill needed. Print, then record it as one or more transactions.</p>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}><X className="w-4 h-4" /></button>
        </div>

        <div className="overflow-y-auto p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="text-[11px] font-semibold col-span-2" style={{ color: 'var(--text-muted)' }}>Bank account
              <select value={accountId} onChange={e => setAccountId(e.target.value)} className={inputCls + ' mt-1'} style={inputStyle}>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              {!bankTpl && <span className="text-[10.5px]" style={{ color: 'var(--amber)' }}>Not linked to a bank with a cheque template — you can still record the payment, but can&apos;t print.</span>}
            </label>

            <label className="text-[11px] font-semibold col-span-2" style={{ color: 'var(--text-muted)' }}>Payee
              <div className="flex gap-2 mt-1">
                <input value={payee} onChange={e => setPayee(e.target.value)} placeholder="Name on the cheque" className={inputCls} style={inputStyle} />
                <button type="button" onClick={() => setPayee('Self')} className="px-3 rounded-lg text-[12px] font-bold flex items-center gap-1 shrink-0" style={{ background: 'var(--surface-2)', color: 'var(--text)', border: '1px solid var(--border)' }}><User className="w-3.5 h-3.5" /> Self</button>
              </div>
            </label>

            <label className="text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>Amount (₹)
              <input type="number" value={amount} onChange={e => setAmount(e.target.value)} className={inputCls + ' mt-1'} style={inputStyle} />
            </label>
            <label className="text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>Date
              <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inputCls + ' mt-1'} style={inputStyle} />
            </label>
            <label className="text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>Cheque number
              <input value={chequeNumber} onChange={e => setChequeNumber(e.target.value)} placeholder="e.g. 100123" className={inputCls + ' mt-1'} style={inputStyle} />
            </label>
            <label className="flex items-end gap-2 text-[13px] pb-2" style={{ color: 'var(--text)' }}>
              <input type="checkbox" checked={acPayee} onChange={e => setAcPayee(e.target.checked)} /> A/C Payee crossing
            </label>
            <p className="col-span-2 text-[12px]" style={{ color: 'var(--text-muted)' }}>In words: <span style={{ color: 'var(--text)', fontWeight: 600 }}>{words}</span></p>
          </div>

          {/* preview */}
          {bankTpl && (
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide mb-2" style={{ color: 'var(--text-muted)' }}>Preview · {wMm}×{hMm} mm</p>
              <div className="overflow-auto rounded-lg p-3" style={{ background: 'var(--surface-2)' }}>
                <div className="relative mx-auto" style={{ width: wMm * MM_TO_PX * scale, height: hMm * MM_TO_PX * scale, background: '#fff', boxShadow: '0 2px 12px rgba(0,0,0,0.15)', borderRadius: 4 }}>
                  {fields.filter(f => f.enabled).map(f => {
                    const t = valueFor(f.key)
                    if (t == null || t === '') return null
                    return (
                      <div key={f.key} className="absolute whitespace-nowrap" style={{
                        left: f.x * MM_TO_PX * scale, top: f.y * MM_TO_PX * scale,
                        width: f.w ? f.w * MM_TO_PX * scale : undefined,
                        fontSize: f.fontSize * PT_TO_PX * scale, color: f.color,
                        fontWeight: f.bold ? 700 : 400, textAlign: f.align,
                        letterSpacing: (f.letterSpacing ?? 0) * PT_TO_PX * scale,
                        fontFamily: 'Helvetica, Arial, sans-serif', lineHeight: 1.1,
                      }}>{t}</div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {/* split into transactions */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Record as transactions</p>
              <span className="text-[11px]" style={{ color: Math.abs(remaining) < 0.01 ? 'var(--income)' : 'var(--expense)' }}>
                Lines ₹{linesTotal.toLocaleString('en-IN')} {amt > 0 && `· ${remaining === 0 ? 'balanced' : (remaining > 0 ? `₹${remaining.toLocaleString('en-IN')} left` : `₹${Math.abs(remaining).toLocaleString('en-IN')} over`)}`}
              </span>
            </div>
            <div className="space-y-2">
              {lines.map(l => (
                <div key={l.id} className="rounded-lg border p-2 space-y-2" style={{ borderColor: 'var(--border)' }}>
                  <div className="flex items-center gap-2">
                    <div className="flex rounded-lg overflow-hidden shrink-0" style={{ border: '1px solid var(--border)' }}>
                      {(['expense', 'transfer'] as const).map(k => (
                        <button key={k} type="button" onClick={() => setLine(l.id, { kind: k })} className="px-2.5 py-2 text-[11px] font-bold" style={{ background: l.kind === k ? 'var(--brand)' : 'var(--surface-2)', color: l.kind === k ? '#fff' : 'var(--text-muted)' }}>{k === 'expense' ? 'Expense' : 'Transfer'}</button>
                      ))}
                    </div>
                    {l.kind === 'transfer' ? (
                      <select value={l.toAccountId} onChange={e => setLine(l.id, { toAccountId: e.target.value })} className="flex-1 px-3 py-2 rounded-lg border text-sm" style={inputStyle}>
                        <option value="">To account…</option>
                        {accounts.filter(a => a.id !== accountId).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                      </select>
                    ) : (
                      <input value={l.name} onChange={e => setLine(l.id, { name: e.target.value })} placeholder="What is this for? (e.g. Rent)" className="flex-1 px-3 py-2 rounded-lg border text-sm" style={inputStyle} />
                    )}
                    <input type="number" value={l.amount} onChange={e => setLine(l.id, { amount: e.target.value })} onFocus={() => { if (!l.amount && remaining > 0) fillRemainingInto(l.id) }} placeholder="0.00" className="w-28 px-3 py-2 rounded-lg border text-sm text-right tabular-nums" style={inputStyle} />
                    <button type="button" onClick={() => setLines(prev => prev.length > 1 ? prev.filter(x => x.id !== l.id) : prev)} className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'var(--surface-2)' }}><Trash2 className="w-3.5 h-3.5 text-[var(--expense)]" /></button>
                  </div>
                  {l.kind === 'transfer' && (
                    <input value={l.name} onChange={e => setLine(l.id, { name: e.target.value })} placeholder="Note (optional) — defaults to “Transfer to …”" className="w-full px-3 py-1.5 rounded-lg border text-[12px]" style={inputStyle} />
                  )}
                </div>
              ))}
              <button type="button" onClick={addLine} className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold border border-dashed" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}><Plus className="w-3.5 h-3.5" /> Add transaction line</button>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 px-5 py-3 border-t shrink-0" style={{ borderColor: 'var(--border)' }}>
          <button onClick={handlePrint} disabled={busy || !bankTpl} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold disabled:opacity-50" style={{ background: 'var(--surface-2)', color: 'var(--text)', border: '1px solid var(--border)' }}>
            <Printer className="w-4 h-4" /> {busy ? 'Working…' : printed ? 'Re-print' : 'Print cheque'}
          </button>
          <div className="flex-1" />
          <button onClick={handleRecord} disabled={busy} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-bold disabled:opacity-60" style={{ background: 'var(--brand)' }}>
            <Check className="w-4 h-4" /> Record
          </button>
        </div>
      </div>
    </div>
  )
}
