'use client'

import { useMemo, useState } from 'react'
import { X, Printer, Check } from 'lucide-react'
import type { Bank, ChequeFieldKey } from '@/lib/cheque/types'
import { MM_TO_PX, AC_PAYEE_TEXT } from '@/lib/cheque/types'
import { amountInWords, amountInFigures } from '@/lib/cheque/amountWords'
import { renderChequePdfBlob } from '@/lib/cheque/pdf'
import { notify } from '@/components/shared/Toast'

interface Props {
  bank: Bank
  accountName: string
  defaultPayee: string
  defaultAmount: number
  defaultDate: string          // yyyy-mm-dd
  onConfirm: (data: { chequeNumber: string; pdfBlob: Blob; date: string }) => Promise<void> | void
  onClose: () => void
}

const PT_TO_PX = 96 / 72

function fmtDate(iso: string): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

export default function ChequePrintModal({ bank, accountName, defaultPayee, defaultAmount, defaultDate, onConfirm, onClose }: Props) {
  const [date, setDate] = useState(defaultDate)
  const [payee, setPayee] = useState(defaultPayee)
  const [amount, setAmount] = useState(String(defaultAmount || ''))
  const [chequeNumber, setChequeNumber] = useState('')
  const [acPayee, setAcPayee] = useState(true)
  const [printed, setPrinted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [blob, setBlob] = useState<Blob | null>(null)

  const amt = parseFloat(amount) || 0
  const words = useMemo(() => amountInWords(amt), [amt])
  const figures = useMemo(() => amountInFigures(amt), [amt])

  const values = {
    date: fmtDate(date),
    payee,
    amountFigures: figures,
    amountWords: words,
    acPayee,
    chequeNumber,
  }
  const valueFor = (k: ChequeFieldKey): string | null => {
    switch (k) {
      case 'date': return values.date
      case 'payee': return values.payee
      case 'amount_figures': return values.amountFigures
      case 'amount_words': return values.amountWords
      case 'ac_payee': return acPayee ? AC_PAYEE_TEXT : null
      default: return null
    }
  }

  const wMm = bank.cheque_width_mm || 200
  const hMm = bank.cheque_height_mm || 92
  const scale = Math.min(1, 560 / (wMm * MM_TO_PX))
  const fields = Array.isArray(bank.cheque_fields) ? bank.cheque_fields : []

  async function handlePrint() {
    setBusy(true)
    try {
      const b = await renderChequePdfBlob(bank, values)
      setBlob(b)
      const url = URL.createObjectURL(b)
      const win = window.open(url, '_blank')
      if (win) {
        win.addEventListener('load', () => { try { win.focus(); win.print() } catch { /* user prints manually */ } })
      } else {
        notify('Allow pop-ups to open the print dialog, or download from the new tab.', 'info')
      }
      setPrinted(true)
    } catch (e) {
      notify('Could not generate the cheque PDF: ' + (e as Error).message, 'error')
    } finally { setBusy(false) }
  }

  async function handleRecord() {
    let b = blob
    if (!b) { b = await renderChequePdfBlob(bank, values); setBlob(b) }
    await onConfirm({ chequeNumber, pdfBlob: b, date })
  }

  const inputCls = 'w-full px-3 py-2 rounded-lg border text-sm'
  const inputStyle = { background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full max-w-3xl rounded-2xl overflow-hidden flex flex-col max-h-[92vh]" style={{ background: 'var(--surface)' }}>
        <div className="flex items-center justify-between px-5 py-3 border-b shrink-0" style={{ borderColor: 'var(--border)' }}>
          <div>
            <p className="font-extrabold" style={{ color: 'var(--text)' }}>Print cheque — {bank.name}</p>
            <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>{accountName}</p>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}><X className="w-4 h-4" /></button>
        </div>

        <div className="overflow-y-auto p-5 space-y-4">
          {/* editable fields */}
          <div className="grid grid-cols-2 gap-3">
            <label className="text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>Date
              <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inputCls + ' mt-1'} style={inputStyle} />
            </label>
            <label className="text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>Cheque number
              <input value={chequeNumber} onChange={e => setChequeNumber(e.target.value)} placeholder="e.g. 100123" className={inputCls + ' mt-1'} style={inputStyle} />
            </label>
            <label className="text-[11px] font-semibold col-span-2" style={{ color: 'var(--text-muted)' }}>Payee
              <input value={payee} onChange={e => setPayee(e.target.value)} className={inputCls + ' mt-1'} style={inputStyle} />
            </label>
            <label className="text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>Amount (₹)
              <input type="number" value={amount} onChange={e => setAmount(e.target.value)} className={inputCls + ' mt-1'} style={inputStyle} />
            </label>
            <label className="flex items-end gap-2 text-[13px] pb-2" style={{ color: 'var(--text)' }}>
              <input type="checkbox" checked={acPayee} onChange={e => setAcPayee(e.target.checked)} /> A/C Payee crossing
            </label>
            <p className="col-span-2 text-[12px]" style={{ color: 'var(--text-muted)' }}>In words: <span style={{ color: 'var(--text)', fontWeight: 600 }}>{words}</span></p>
          </div>

          {/* live preview (no background — exactly what prints) */}
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide mb-2" style={{ color: 'var(--text-muted)' }}>Preview (actual layout · {wMm}×{hMm} mm)</p>
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
        </div>

        <div className="flex items-center gap-2 px-5 py-3 border-t shrink-0" style={{ borderColor: 'var(--border)' }}>
          <button onClick={handlePrint} disabled={busy} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold disabled:opacity-60" style={{ background: 'var(--surface-2)', color: 'var(--text)', border: '1px solid var(--border)' }}>
            <Printer className="w-4 h-4" /> {busy ? 'Generating…' : printed ? 'Re-print' : 'Print cheque'}
          </button>
          <div className="flex-1" />
          <button onClick={handleRecord} disabled={busy} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-bold disabled:opacity-60" style={{ background: printed ? 'var(--brand)' : 'var(--text-faint)' }}>
            <Check className="w-4 h-4" /> Record payment
          </button>
        </div>
      </div>
    </div>
  )
}
