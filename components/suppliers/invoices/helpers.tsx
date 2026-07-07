import {
  AlertTriangle, CheckCircle2, Clock, Circle, X,
} from 'lucide-react'
import type { SupplierInvoice, Supplier } from '@/lib/suppliers/types'

// Extended type to cover v27 fields
export type InvoiceExt = SupplierInvoice & { payee_name?: string | null; is_personal_bill?: boolean }

// ── Helpers ───────────────────────────────────────────────────────────────────

export function fmt(n: number) {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(n)
}

export function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function daysOverdue(d: string) {
  return Math.floor((Date.now() - new Date(d).getTime()) / 86400000)
}

export function daysDue(d: string) {
  return Math.ceil((new Date(d).getTime() - Date.now()) / 86400000)
}

export function displayName(inv: InvoiceExt): string {
  const sup = inv.supplier as unknown as Supplier
  return sup?.name ?? inv.payee_name ?? inv.invoice_number ?? 'Unnamed'
}

// ── Status config ─────────────────────────────────────────────────────────────

export const STATUS: Record<string, { label: string; bg: string; text: string; icon: React.ReactNode }> = {
  pending:   { label: 'Pending',   bg: 'rgba(42,122,80,0.08)',   text: 'var(--brand)',   icon: <Circle className="w-3 h-3" /> },
  due:       { label: 'Due Soon',  bg: 'color-mix(in srgb, var(--amber) 10%, transparent)',   text: 'var(--amber)',        icon: <Clock className="w-3 h-3" /> },
  overdue:   { label: 'Overdue',   bg: 'color-mix(in srgb, var(--expense) 10%, transparent)',    text: 'var(--expense)',        icon: <AlertTriangle className="w-3 h-3" /> },
  paid:      { label: 'Paid',      bg: 'color-mix(in srgb, var(--income) 10%, transparent)',    text: 'var(--income)',        icon: <CheckCircle2 className="w-3 h-3" /> },
  partial:   { label: 'Partial',   bg: 'rgba(168,85,247,0.1)',   text: '#9333ea',        icon: <Circle className="w-3 h-3" /> },
  cancelled: { label: 'Cancelled', bg: 'rgba(107,114,128,0.1)', text: '#6b7280',        icon: <X className="w-3 h-3" /> },
}

export const REC_STATUS: Record<string, { label: string; bg: string; text: string }> = {
  pending_billing:  { label: 'Pending Billing',  bg: 'color-mix(in srgb, var(--amber) 12%, transparent)',  text: 'var(--amber)' },
  billed:           { label: 'Billed',            bg: 'rgba(42,122,80,0.1)',   text: 'var(--brand)' },
  recovered:        { label: 'Recovered',         bg: 'color-mix(in srgb, var(--income) 10%, transparent)',   text: 'var(--income)' },
  partial_recovery: { label: 'Partial Recovery',  bg: 'rgba(168,85,247,0.1)',  text: '#9333ea' },
  written_off:      { label: 'Written Off',       bg: 'rgba(107,114,128,0.1)', text: '#6b7280' },
}
