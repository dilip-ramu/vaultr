import { defaultLayout, PAGE_H, type LayoutEl } from '../lib/documents/layout'
import { measuredHeight } from '../components/templates/LayoutRenderer'
import type { LayoutContext } from '../lib/documents/layoutContext'

const ctx = {
  accent: '#c99', columns: [], rows: [], totals: [], grandLabel: 'TOTAL', grandValue: '₹1',
  bankLines: [], terms: 'Payment within 30 days.',
  fields: {
    'doc.title': 'PROFORMA INVOICE', 'doc.number': 'L-PI260001', 'doc.date': '2026-07-11',
    'company.name': 'Lullabee',
    'company.address': '4/603, Kurunji Nagar, Nathakadu,\nVeerapandi,\nTiruppur- 641605\nTamil Nadu, India',
    'company.gstin': '33AAMFL2572J1Z4',
    'party.label': 'CUSTOMER', 'party.name': 'Amaravathi Garments Mfg Co',
    'party.address': 'NEW NO.18/ OLD NO.17, , 4TH  CROSS STREET\nCHENNAI\nChennai\nTamil Nadu 600024',
    'party.gstin': '33AANFA7615E1ZN',
    'totals.inWords': 'Indian Rupee Fifteen Lakh Seventy-Two Thousand One Hundred Eighty-Two Paise Only',
  },
} as unknown as LayoutContext

const l = defaultLayout('proforma_gst', 'PROFORMA INVOICE')
const li = l.elements.find(e => e.type === 'lineItems')!
const ordered = l.elements.filter(e => (e.on ?? 'first') !== 'last').slice().sort((a, b) => a.y - b.y || a.x - b.x)
const shift = new Map<string, number>()
const grown: { x: number; w: number; bottom: number; delta: number }[] = []
for (const el of ordered) {
  const ox = (g: { x: number; w: number }) => !(el.x + el.w <= g.x || g.x + g.w <= el.x)
  let s = 0
  for (const g of grown) if (el.y >= g.bottom && ox(g)) s += g.delta
  shift.set(el.id, s)
  const d = measuredHeight(el as LayoutEl, ctx) - el.h
  if (d !== 0) grown.push({ x: el.x, w: el.w, bottom: el.y + el.h, delta: d })
  if (el.id === li.id) grown.length = 0
}
type Box = { name: string; x: number; w: number; top: number; bot: number }
const boxes: Box[] = ordered.filter(e => e.type !== 'accentBar').map(e => {
  const s = shift.get(e.id) ?? 0
  const h = e.id === li.id ? e.h - s : measuredHeight(e as LayoutEl, ctx)
  return { name: `${e.type}:${e.field ?? e.text ?? ''}`.slice(0, 34), x: e.x, w: e.w, top: e.y + s, bot: e.y + s + h }
})
for (const b of boxes) console.log(b.name.padEnd(36), String(Math.round(b.top)).padStart(5), '→', String(Math.round(b.bot)).padStart(5))
let bad = 0
for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
  const a = boxes[i], b = boxes[j]
  if (a.bot <= b.top || b.bot <= a.top) continue
  if (a.x + a.w <= b.x || b.x + b.w <= a.x) continue
  bad++; console.log('!! OVERLAP', a.name, '<->', b.name)
}
const liBox = boxes.find(b => b.name.startsWith('lineItems'))!
console.log('rows on page 1:', Math.floor((liBox.bot - liBox.top - 26) / 30), '| overlaps:', bad, '| page height', PAGE_H)
