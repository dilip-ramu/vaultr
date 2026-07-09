'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { X, Download, Share2, Loader2 } from 'lucide-react'
import type { Account, DebitCard } from '@/lib/types'

interface Props {
  account: Account
  accent: string       // hex, e.g. #3B82F6
  typeLabel: string
  debitCards: DebitCard[]
  onClose: () => void
}

// ── colour helpers ────────────────────────────────────────────────────────
function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace('#', '').trim()
  if (h.length === 3) h = h.split('').map(c => c + c).join('')
  const n = parseInt(h || '334155', 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
function darken([r, g, b]: [number, number, number], amt: number): string {
  return `rgb(${Math.round(r * (1 - amt))},${Math.round(g * (1 - amt))},${Math.round(b * (1 - amt))})`
}
function loadImg(url?: string | null): Promise<HTMLImageElement | null> {
  return new Promise(resolve => {
    if (!url) return resolve(null)
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = url
  })
}
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}
function maskNumber(n?: string | null): string {
  if (!n) return '—'
  const digits = n.replace(/\s/g, '')
  const last4 = digits.slice(-4)
  return `•••• •••• •••• ${last4}`
}
function groupNumber(n?: string | null): string {
  if (!n) return '—'
  return n.replace(/\s/g, '').replace(/(.{4})/g, '$1 ').trim()
}

export default function ShareCardModal({ account, accent, typeLabel, debitCards, onClose }: Props) {
  const [showCardNums, setShowCardNums] = useState(false)
  const [dataUrl, setDataUrl] = useState('')
  const [busy, setBusy] = useState(true)
  const [tainted, setTainted] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const isCredit = account.type === 'credit'

  const draw = useCallback(async () => {
    setBusy(true)
    const [logo, photo] = await Promise.all([loadImg(account.bank_logo_url), loadImg(account.avatar_url)])
    const canvas = canvasRef.current
    if (!canvas) return
    const DPR = 2
    const W = 1080
    const H = showCardNums && (debitCards.length || isCredit) ? 940 : 760
    canvas.width = W * DPR; canvas.height = H * DPR
    const ctx = canvas.getContext('2d')!
    ctx.scale(DPR, DPR)

    const rgb = hexToRgb(accent)
    // background gradient
    const grad = ctx.createLinearGradient(0, 0, W, H)
    grad.addColorStop(0, darken(rgb, 0.5))
    grad.addColorStop(1, accent)
    roundRect(ctx, 0, 0, W, H, 40); ctx.fillStyle = grad; ctx.fill()
    // soft highlight
    const glow = ctx.createRadialGradient(W * 0.8, 60, 0, W * 0.8, 60, 520)
    glow.addColorStop(0, 'rgba(255,255,255,0.14)'); glow.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = glow; roundRect(ctx, 0, 0, W, H, 40); ctx.fill()

    const P = 64
    ctx.textBaseline = 'top'

    // ── header: logo + name (left), photo (right) ──
    let nameX = P
    if (logo) {
      roundRect(ctx, P, 56, 104, 104, 20); ctx.fillStyle = '#fff'; ctx.fill()
      ctx.save(); roundRect(ctx, P, 56, 104, 104, 20); ctx.clip()
      const s = Math.min(88 / logo.width, 88 / logo.height)
      const w = logo.width * s, h = logo.height * s
      ctx.drawImage(logo, P + (104 - w) / 2, 56 + (104 - h) / 2, w, h)
      ctx.restore()
      nameX = P + 128
    }
    if (photo) {
      const d = 104, px = W - P - d, py = 56
      ctx.save(); ctx.beginPath(); ctx.arc(px + d / 2, py + d / 2, d / 2, 0, Math.PI * 2); ctx.closePath(); ctx.clip()
      const s = Math.max(d / photo.width, d / photo.height)
      ctx.drawImage(photo, px + (d - photo.width * s) / 2, py + (d - photo.height * s) / 2, photo.width * s, photo.height * s)
      ctx.restore()
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,0.6)'
      ctx.beginPath(); ctx.arc(px + d / 2, py + d / 2, d / 2, 0, Math.PI * 2); ctx.stroke()
    }
    ctx.fillStyle = '#fff'; ctx.font = '700 46px system-ui, sans-serif'
    ctx.fillText(account.name, nameX, 62, W - nameX - P - (photo ? 120 : 0))
    ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.font = '700 22px system-ui, sans-serif'
    ctx.fillText(typeLabel.toUpperCase(), nameX, 116)

    // ── primary number ──
    let y = 210
    const label = (t: string, yy: number) => { ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.font = '700 20px system-ui, sans-serif'; ctx.fillText(t.toUpperCase(), P, yy) }
    const value = (t: string, yy: number, size = 30) => { ctx.fillStyle = '#fff'; ctx.font = `600 ${size}px ui-monospace, monospace`; ctx.fillText(t, P, yy) }
    label(isCredit ? 'Card number' : 'Account number', y)
    const primary = isCredit && !showCardNums ? maskNumber(account.account_number) : groupNumber(account.account_number)
    value(primary, y + 28, 40)
    y += 96

    // ── details grid ──
    const rows: [string, string][] = []
    rows.push([isCredit ? 'Cardholder' : 'Account holder', account.account_holder || account.name])
    if (account.ifsc_code) rows.push(['IFSC', account.ifsc_code])
    if (account.swift_code) rows.push(['SWIFT', account.swift_code])
    if (account.branch) rows.push(['Branch', account.branch])
    if (account.bank_customer_id) rows.push(['Customer ID', account.bank_customer_id])
    const colW = (W - P * 2) / 2
    rows.forEach((r, i) => {
      const col = i % 2, rowN = Math.floor(i / 2)
      const rx = P + col * colW, ry = y + rowN * 92
      ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.font = '700 18px system-ui, sans-serif'
      ctx.fillText(r[0].toUpperCase(), rx, ry)
      ctx.fillStyle = '#fff'; ctx.font = '600 26px system-ui, sans-serif'
      ctx.fillText(r[1], rx, ry + 26, colW - 20)
    })
    y += Math.ceil(rows.length / 2) * 92 + 8

    // address (full width, wrapped)
    if (account.bank_address) {
      ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.font = '700 18px system-ui, sans-serif'
      ctx.fillText('BRANCH ADDRESS', P, y); y += 26
      ctx.fillStyle = '#fff'; ctx.font = '500 22px system-ui, sans-serif'
      const words = account.bank_address.split(/\s+/); let line = ''
      for (const w of words) {
        if (ctx.measureText(line + ' ' + w).width > W - P * 2 && line) { ctx.fillText(line, P, y); y += 30; line = w }
        else line = line ? line + ' ' + w : w
      }
      if (line) { ctx.fillText(line, P, y); y += 30 }
      y += 6
    }

    // ── optional card numbers ──
    if (showCardNums && (debitCards.length || isCredit)) {
      ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.moveTo(P, y + 4); ctx.lineTo(W - P, y + 4); ctx.stroke(); y += 24
      if (isCredit) {
        const exp = account.card_expiry_month ? `${String(account.card_expiry_month).padStart(2, '0')}/${String(account.card_expiry_year ?? '').slice(-2)}` : ''
        label(`${account.card_network || 'Card'} · valid thru ${exp}`, y); y += 28
      }
      for (const dc of debitCards) {
        label(`${dc.card_network || 'Debit'}${dc.card_holder ? ' · ' + dc.card_holder : ''}`, y)
        value(groupNumber(dc.card_number), y + 26, 30)
        const exp = dc.expiry_month ? `${String(dc.expiry_month).padStart(2, '0')}/${String(dc.expiry_year ?? '').slice(-2)}` : ''
        if (exp) { ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.font = '600 22px system-ui, sans-serif'; ctx.fillText('exp ' + exp, W - P - 160, y + 30) }
        y += 74
      }
    }

    // footer
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = '600 18px system-ui, sans-serif'
    ctx.fillText('Vaultr', P, H - 44)

    try {
      setDataUrl(canvas.toDataURL('image/jpeg', 0.95))
      setTainted(false)
    } catch {
      setTainted(true); setDataUrl('')
    }
    setBusy(false)
  }, [account, accent, typeLabel, debitCards, showCardNums, isCredit])

  useEffect(() => { void draw() }, [draw])

  const download = () => {
    if (!dataUrl) return
    const a = document.createElement('a')
    a.href = dataUrl; a.download = `${account.name.replace(/\s+/g, '-')}-bank-details.jpg`
    document.body.appendChild(a); a.click(); a.remove()
  }
  const share = async () => {
    if (!dataUrl) return
    try {
      const blob = await (await fetch(dataUrl)).blob()
      const file = new File([blob], `${account.name}-bank-details.jpg`, { type: 'image/jpeg' })
      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
      if (nav.canShare && nav.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: `${account.name} — bank details` })
      } else download()
    } catch { download() }
  }

  const hasCardData = debitCards.length > 0 || isCredit

  return (
    <div className="fixed inset-0 z-[60] flex items-end md:items-center justify-center" style={{ background: 'rgba(0,0,0,0.55)' }} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full md:max-w-lg rounded-t-3xl md:rounded-2xl p-5 md:p-6 max-h-[92vh] overflow-y-auto slide-up" style={{ background: 'var(--surface)' }}>
        <div className="flex items-center justify-between mb-4">
          <p className="text-base font-extrabold" style={{ color: 'var(--text)' }}>Share bank details</p>
          <button onClick={onClose} className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}><X className="w-4 h-4" /></button>
        </div>

        {/* Preview */}
        <div className="rounded-2xl overflow-hidden mb-4 relative" style={{ boxShadow: 'var(--shadow-lg)', minHeight: 180 }}>
          {busy && <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'var(--surface-2)' }}><Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--text-muted)' }} /></div>}
          {dataUrl
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={dataUrl} alt="Bank details card" className="w-full block" />
            : tainted && <p className="text-sm p-6 text-center" style={{ color: 'var(--text-muted)' }}>Couldn’t render the images. The card still works without the logo/photo.</p>}
        </div>
        <canvas ref={canvasRef} className="hidden" />

        {/* Toggle card numbers */}
        {hasCardData && (
          <button onClick={() => setShowCardNums(v => !v)} className="w-full flex items-center justify-between rounded-xl px-4 py-3 mb-4" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
            <div className="text-left">
              <p className="text-[13px] font-bold" style={{ color: 'var(--text)' }}>Include {isCredit ? 'full card number' : 'debit card numbers'}</p>
              <p className="text-[11px]" style={{ color: 'var(--text-faint)' }}>Off by default. CVV is never stored or shown.</p>
            </div>
            <span className="w-11 h-6 rounded-full flex items-center transition-colors shrink-0" style={{ background: showCardNums ? 'var(--brand)' : 'var(--border)', padding: 2 }}>
              <span className="w-5 h-5 rounded-full bg-white transition-transform" style={{ transform: showCardNums ? 'translateX(20px)' : 'translateX(0)' }} />
            </span>
          </button>
        )}

        <div className="flex gap-2">
          <button onClick={share} disabled={!dataUrl} className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-white text-sm font-bold disabled:opacity-50" style={{ background: 'var(--brand)' }}><Share2 className="w-4 h-4" /> Share</button>
          <button onClick={download} disabled={!dataUrl} className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-bold disabled:opacity-50" style={{ background: 'var(--surface-2)', color: 'var(--text)', border: '1px solid var(--border)' }}><Download className="w-4 h-4" /> Save</button>
        </div>
        <p className="text-[11px] mt-3 text-center" style={{ color: 'var(--text-faint)' }}>Anyone with this image can see the details shown. Share carefully.</p>
      </div>
    </div>
  )
}
