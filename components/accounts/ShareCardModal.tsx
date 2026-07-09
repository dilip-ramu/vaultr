'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { X, Download, Share2, Loader2 } from 'lucide-react'
import type { Account, DebitCard } from '@/lib/types'
import { deriveCardColors } from '@/lib/card-gradient'

interface Props {
  account: Account
  accent: string       // hex, e.g. #3B82F6
  typeLabel: string
  photoUrl?: string | null   // account-holder photo (from the linked user)
  debitCards: DebitCard[]
  onClose: () => void
}

function hexToRgb(hex: string): [number, number, number] {
  let h = (hex || '#334155').replace('#', '').trim()
  if (h.length === 3) h = h.split('').map(c => c + c).join('')
  const n = parseInt(h, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
function loadImg(url?: string | null): Promise<HTMLImageElement | null> {
  return new Promise(res => {
    if (!url) return res(null)
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => res(img)
    img.onerror = () => res(null)
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
const groupNum = (n?: string | null) => n ? n.replace(/\s/g, '').replace(/(.{4})/g, '$1 ').trim() : '—'
const money = (n?: number | null) => '₹' + new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Math.abs(Number(n ?? 0)))

export default function ShareCardModal({ account, accent, typeLabel, photoUrl, debitCards, onClose }: Props) {
  const isCredit = account.type === 'credit'
  const [inclBalance, setInclBalance] = useState(false)
  const [inclExpiry, setInclExpiry] = useState(false)
  const [inclDebit, setInclDebit] = useState(false)
  const [dataUrl, setDataUrl] = useState('')
  const [busy, setBusy] = useState(true)
  const [tainted, setTainted] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const exp = account.card_expiry_month
    ? `${String(account.card_expiry_month).padStart(2, '0')}/${String(account.card_expiry_year ?? '').slice(-2)}`
    : ''

  const draw = useCallback(async () => {
    setBusy(true)
    const [logo, photo] = await Promise.all([loadImg(account.bank_logo_url), loadImg(photoUrl ?? account.avatar_url)])
    const canvas = canvasRef.current
    if (!canvas) return
    const DPR = 3, W = 900, P = 52

    // ── build detail rows ──
    const rows: [string, string][] = [[isCredit ? 'Cardholder' : 'Account holder', account.account_holder || account.name]]
    if (account.ifsc_code) rows.push(['IFSC', account.ifsc_code])
    if (account.swift_code) rows.push(['SWIFT', account.swift_code])
    if (account.branch) rows.push(['Branch', account.branch])
    if (account.bank_customer_id) rows.push(['Customer ID', account.bank_customer_id])
    if (inclBalance) rows.push([isCredit ? 'Outstanding' : 'Balance', money(account.balance)])
    if (inclBalance && isCredit && account.credit_limit) rows.push(['Credit limit', money(account.credit_limit)])
    if (inclExpiry && isCredit && exp) rows.push(['Valid thru', exp])

    // ── measure address wrap ──
    const measure = document.createElement('canvas').getContext('2d')!
    const addrFont = '500 24px system-ui, sans-serif'
    const addrLines: string[] = []
    if (account.bank_address) {
      measure.font = addrFont
      let line = ''
      for (const w of account.bank_address.split(/\s+/)) {
        if (measure.measureText(line + ' ' + w).width > W - P * 2 && line) { addrLines.push(line); line = w }
        else line = line ? line + ' ' + w : w
      }
      if (line) addrLines.push(line)
    }

    const showDebit = inclDebit && !isCredit && debitCards.length > 0
    const rowGridH = Math.ceil(rows.length / 2) * 88
    const addrH = addrLines.length ? 32 + addrLines.length * 32 + 10 : 0
    const debitH = showDebit ? 24 + debitCards.length * 80 : 0
    const bandH = photo ? 132 : 0   // account-holder photo lives in a bottom band

    // ── total height (no wasted space) ──
    const H = 48 + 100 + 30 /*header*/ + 100 /*primary*/ + rowGridH + addrH + debitH + bandH + 44 /*bottom pad*/
    canvas.width = W * DPR; canvas.height = H * DPR
    const ctx = canvas.getContext('2d')!
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0)
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'

    // white behind the rounded corners
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H)

    // ── card face: "30a" diagonal glass — three same-hue tones (c1 dark,
    //    c2 = chosen colour, c3 light) that accentuate each other ──
    const { c1, c2, c3 } = deriveCardColors(accent)
    ctx.save()
    roundRect(ctx, 0, 0, W, H, 40); ctx.clip()   // everything below stays on the card

    // base gradient c1 → c2 (≈140°)
    const base = ctx.createLinearGradient(0, 0, W, H)
    base.addColorStop(0, c1); base.addColorStop(1, c2)
    ctx.fillStyle = base; ctx.fillRect(0, 0, W, H)

    // facet plane 1 — c2 → c3 across the left diagonal
    ctx.save()
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0.58 * W, 0); ctx.lineTo(0.30 * W, H); ctx.lineTo(0, H); ctx.closePath(); ctx.clip()
    const g1 = ctx.createLinearGradient(0, 0, 0.6 * W, H)
    g1.addColorStop(0, c2); g1.addColorStop(1, c3)
    ctx.globalAlpha = 0.42; ctx.fillStyle = g1; ctx.fillRect(0, 0, W, H)
    ctx.restore()

    // facet plane 2 — c3 → transparent across the upper-right diagonal
    ctx.save()
    ctx.beginPath(); ctx.moveTo(0.58 * W, 0); ctx.lineTo(W, 0); ctx.lineTo(W, 0.42 * H); ctx.lineTo(0.30 * W, H); ctx.closePath(); ctx.clip()
    const [cr, cg, cb] = hexToRgb(c3)
    const g2 = ctx.createLinearGradient(W, 0, 0, H)
    g2.addColorStop(0, `rgb(${cr},${cg},${cb})`); g2.addColorStop(1, `rgba(${cr},${cg},${cb},0)`)
    ctx.globalAlpha = 0.30; ctx.fillStyle = g2; ctx.fillRect(0, 0, W, H)
    ctx.restore()

    // soft top-right sheen
    const glow = ctx.createRadialGradient(W * 0.82, 40, 0, W * 0.82, 40, 460)
    glow.addColorStop(0, 'rgba(255,255,255,0.14)'); glow.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H)
    ctx.restore()   // drop the card clip

    ctx.textBaseline = 'top'

    // header
    let nameX = P
    if (logo) {
      roundRect(ctx, P, 48, 100, 100, 20); ctx.fillStyle = '#fff'; ctx.fill()
      ctx.save(); roundRect(ctx, P, 48, 100, 100, 20); ctx.clip()
      const s = Math.min(84 / logo.width, 84 / logo.height), w = logo.width * s, h = logo.height * s
      ctx.drawImage(logo, P + (100 - w) / 2, 48 + (100 - h) / 2, w, h); ctx.restore()
      nameX = P + 124
    }
    const nameMax = W - nameX - P
    ctx.fillStyle = '#fff'; ctx.font = '700 46px system-ui, sans-serif'; ctx.fillText(account.name, nameX, 56, nameMax)
    ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.font = '700 23px system-ui, sans-serif'; ctx.fillText(typeLabel.toUpperCase(), nameX, 112)

    let y = 178
    const label = (t: string, yy: number, x = P) => { ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.font = '700 20px system-ui, sans-serif'; ctx.fillText(t.toUpperCase(), x, yy) }

    // primary number
    label(isCredit ? 'Card number' : 'Account number', y)
    ctx.fillStyle = '#fff'; ctx.font = '600 44px ui-monospace, monospace'; ctx.fillText(groupNum(account.account_number), P, y + 30)
    y += 100

    // detail grid
    const colW = (W - P * 2) / 2
    rows.forEach((r, i) => {
      const rx = P + (i % 2) * colW, ry = y + Math.floor(i / 2) * 88
      label(r[0], ry, rx)
      ctx.fillStyle = '#fff'; ctx.font = '600 28px system-ui, sans-serif'; ctx.fillText(r[1], rx, ry + 26, colW - 20)
    })
    y += rowGridH

    // address
    if (addrLines.length) {
      label('Branch address', y); y += 32
      ctx.fillStyle = '#fff'; ctx.font = addrFont
      for (const ln of addrLines) { ctx.fillText(ln, P, y); y += 32 }
      y += 10
    }

    // debit numbers
    if (showDebit) {
      ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.moveTo(P, y); ctx.lineTo(W - P, y); ctx.stroke(); y += 22
      for (const dc of debitCards) {
        label(`${dc.card_network || 'Debit card'}${dc.card_holder ? ' · ' + dc.card_holder : ''}`, y)
        ctx.fillStyle = '#fff'; ctx.font = '600 30px ui-monospace, monospace'; ctx.fillText(groupNum(dc.card_number), P, y + 26)
        if (inclExpiry && dc.expiry_month) {
          const e = `${String(dc.expiry_month).padStart(2, '0')}/${String(dc.expiry_year ?? '').slice(-2)}`
          ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.font = '600 24px system-ui, sans-serif'; ctx.textAlign = 'right'
          ctx.fillText('exp ' + e, W - P, y + 30); ctx.textAlign = 'left'
        }
        y += 80
      }
    }

    // account-holder photo — bottom-right, with the holder name to its left
    if (photo) {
      const d = 112, bandTop = H - 44 - d, px = W - P - d, py = bandTop
      ctx.save(); ctx.beginPath(); ctx.arc(px + d / 2, py + d / 2, d / 2, 0, 7); ctx.clip()
      const s = Math.max(d / photo.width, d / photo.height)
      ctx.drawImage(photo, px + (d - photo.width * s) / 2, py + (d - photo.height * s) / 2, photo.width * s, photo.height * s)
      ctx.restore(); ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,0.65)'
      ctx.beginPath(); ctx.arc(px + d / 2, py + d / 2, d / 2, 0, 7); ctx.stroke()
      if (account.account_holder) {
        label('Account holder', bandTop + 32)
        ctx.fillStyle = '#fff'; ctx.font = '700 30px system-ui, sans-serif'
        ctx.fillText(account.account_holder, P, bandTop + 58, px - P - 20)
      }
    }

    try { setDataUrl(canvas.toDataURL('image/jpeg', 0.95)); setTainted(false) }
    catch { setTainted(true); setDataUrl('') }
    setBusy(false)
  }, [account, accent, typeLabel, photoUrl, debitCards, inclBalance, inclExpiry, inclDebit, isCredit, exp])

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
      if (nav.canShare && nav.canShare({ files: [file] })) await navigator.share({ files: [file], title: `${account.name} — bank details` })
      else download()
    } catch { download() }
  }

  const Toggle = ({ on, set, title, sub }: { on: boolean; set: (v: boolean) => void; title: string; sub: string }) => (
    <button onClick={() => set(!on)} className="w-full flex items-center justify-between rounded-xl px-4 py-2.5" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
      <div className="text-left mr-3">
        <p className="text-[13px] font-bold" style={{ color: 'var(--text)' }}>{title}</p>
        <p className="text-[11px]" style={{ color: 'var(--text-faint)' }}>{sub}</p>
      </div>
      <span className="w-11 h-6 rounded-full flex items-center shrink-0" style={{ background: on ? 'var(--brand)' : 'var(--border)', padding: 2 }}>
        <span className="w-5 h-5 rounded-full bg-white transition-transform" style={{ transform: on ? 'translateX(20px)' : 'translateX(0)' }} />
      </span>
    </button>
  )

  return (
    <div className="fixed inset-0 z-[60] flex items-end md:items-center justify-center" style={{ background: 'rgba(0,0,0,0.55)' }} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full md:max-w-lg rounded-t-3xl md:rounded-2xl p-5 md:p-6 max-h-[92vh] overflow-y-auto slide-up" style={{ background: 'var(--surface)' }}>
        <div className="flex items-center justify-between mb-4">
          <p className="text-base font-extrabold" style={{ color: 'var(--text)' }}>Share bank details</p>
          <button onClick={onClose} className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}><X className="w-4 h-4" /></button>
        </div>

        <div className="rounded-2xl overflow-hidden mb-4 relative" style={{ minHeight: 160 }}>
          {busy && <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'var(--surface-2)' }}><Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--text-muted)' }} /></div>}
          {dataUrl
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={dataUrl} alt="Bank details card" className="w-full block" />
            : tainted && <p className="text-sm p-6 text-center" style={{ color: 'var(--text-muted)' }}>Couldn’t render the image. Try re-uploading the logo/photo.</p>}
        </div>
        <canvas ref={canvasRef} className="hidden" />

        <div className="space-y-2 mb-4">
          <Toggle on={inclBalance} set={setInclBalance} title={isCredit ? 'Include balance & credit limit' : 'Include balance'} sub="Off by default." />
          {(isCredit || debitCards.length > 0) && <Toggle on={inclExpiry} set={setInclExpiry} title="Include expiry date" sub={isCredit ? 'Card valid-thru date.' : 'Debit card expiry.'} />}
          {!isCredit && debitCards.length > 0 && <Toggle on={inclDebit} set={setInclDebit} title="Include debit card numbers" sub="CVV is never stored or shown." />}
        </div>

        <div className="flex gap-2">
          <button onClick={share} disabled={!dataUrl} className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-white text-sm font-bold disabled:opacity-50" style={{ background: 'var(--brand)' }}><Share2 className="w-4 h-4" /> Share</button>
          <button onClick={download} disabled={!dataUrl} className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-bold disabled:opacity-50" style={{ background: 'var(--surface-2)', color: 'var(--text)', border: '1px solid var(--border)' }}><Download className="w-4 h-4" /> Save</button>
        </div>
        <p className="text-[11px] mt-3 text-center" style={{ color: 'var(--text-faint)' }}>Anyone with this image can see the details shown. Share carefully.</p>
      </div>
    </div>
  )
}
