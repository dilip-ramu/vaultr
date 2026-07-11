import Link from 'next/link'
import {
  Palette, PenLine, Images, CreditCard, ReceiptText, Send, FileText,
  ClipboardList, Truck, CornerUpLeft, ShoppingCart, CornerUpRight, UserSquare, FileSignature, ChevronRight,
} from 'lucide-react'
import { TEMPLATE_FORMATS, TEMPLATE_GROUPS } from '@/lib/documents/templateFormats'

export const metadata = { title: 'Templates — Vaultr' }

const ICONS: Record<string, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
  accent: Palette, signatories: PenLine, assets: Images, cheque: CreditCard,
  tax_invoice: ReceiptText, reimbursable: Send, quotation: FileText, proforma_gst: ClipboardList,
  sales_order: ClipboardList, delivery_challan: Truck, credit_note: CornerUpLeft,
  purchase_order: ShoppingCart, debit_note: CornerUpRight,
  salary_slip: UserSquare, contract: FileSignature,
}

export default function TemplatesHubPage() {
  return (
    <div className="w-full px-4 md:px-8 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: 'var(--text)' }}>Templates</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
          Design how every printed document looks — per company. Pick one to open its designer.
        </p>
      </div>

      <div className="space-y-7">
        {TEMPLATE_GROUPS.map(group => {
          const items = TEMPLATE_FORMATS.filter(f => f.group === group)
          if (!items.length) return null
          return (
            <section key={group}>
              <p className="text-[11px] font-bold uppercase tracking-widest mb-2.5" style={{ color: 'var(--text-faint)' }}>{group}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {items.map(f => {
                  const Icon = ICONS[f.slug] ?? FileText
                  return (
                    <Link
                      key={f.slug}
                      href={`/templates/${f.slug}`}
                      className="group rounded-2xl border p-4 flex items-start gap-3 transition-colors hover:border-[var(--brand)]"
                      style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
                    >
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'var(--brand-light)' }}>
                        <Icon className="w-5 h-5" style={{ color: 'var(--brand)' }} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1">
                          <p className="font-bold truncate" style={{ color: 'var(--text)' }}>{f.label}</p>
                          <ChevronRight className="w-3.5 h-3.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: 'var(--brand)' }} />
                        </div>
                        <p className="text-xs mt-0.5 leading-snug" style={{ color: 'var(--text-muted)' }}>{f.desc}</p>
                      </div>
                    </Link>
                  )
                })}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}
