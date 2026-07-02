// ── Invoice / document template + accent (Feature 1) ────────────────────────
// Per-company presentation settings. A company picks one structural layout
// (template) and one accent colour; both the tax-invoice print view and the
// React-PDF documents (reimbursement invoice, salary slip) read these to
// render a look that's distinct per company.

export type InvoiceTemplate = 'classic' | 'modern' | 'minimal'

export interface TemplateOption {
  id: InvoiceTemplate
  label: string
  blurb: string
}

export const INVOICE_TEMPLATES: TemplateOption[] = [
  { id: 'classic', label: 'Classic', blurb: 'Logo left, ruled header, grey table' },
  { id: 'modern',  label: 'Modern',  blurb: 'Coloured header band, filled table' },
  { id: 'minimal', label: 'Minimal', blurb: 'Airy layout, hairline table' },
]

export const DEFAULT_INVOICE_TEMPLATE: InvoiceTemplate = 'classic'

// The app's brand green — keeps existing companies looking unchanged.
export const DEFAULT_INVOICE_ACCENT = '#2A7A50'

export interface AccentPreset {
  name: string
  value: string
}

// Curated so every swatch has enough contrast for white text on a filled
// header band (used by the Modern template + the PDF documents).
export const ACCENT_PRESETS: AccentPreset[] = [
  { name: 'Green',  value: '#2A7A50' },
  { name: 'Blue',   value: '#1D4ED8' },
  { name: 'Indigo', value: '#4F46E5' },
  { name: 'Plum',   value: '#7C3AED' },
  { name: 'Coral',  value: '#D85A30' },
  { name: 'Teal',   value: '#0F766E' },
  { name: 'Slate',  value: '#334155' },
  { name: 'Black',  value: '#1A1A1A' },
]

export function normalizeTemplate(v: unknown): InvoiceTemplate {
  return v === 'modern' || v === 'minimal' ? v : DEFAULT_INVOICE_TEMPLATE
}

/** Accepts only #RRGGBB; anything else falls back to the brand accent. */
export function normalizeAccent(v: unknown): string {
  return typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v : DEFAULT_INVOICE_ACCENT
}

/** An 8-digit-hex soft tint of the accent (~8% alpha) for pale backgrounds. */
export function accentSoft(accent: string): string {
  const a = normalizeAccent(accent)
  return `${a}14`
}
