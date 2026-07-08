'use client'

import {
  LayoutDashboard, ArrowLeftRight, Wallet, Target, Users, Building2, CalendarClock,
  Wrench, BookOpen, Search, Plus, Lock, ChevronRight,
} from 'lucide-react'

/**
 * GuideShot — a high-fidelity "annotated screenshot" of a real Vaultr screen.
 * It reproduces the actual chrome (browser or phone), the real sidebar, and the
 * screen's header/tabs/chips/content in the app's own tokens, then overlays
 * numbered pin badges + highlight rings on the exact control each step refers
 * to. A numbered legend under the frame ties pins to the written steps.
 *
 * Everything is data (ScreenSpec) so articles stay declarative.
 */

export interface Pin { n: number; label: string }

export type ShotItem =
  | { type: 'groupLabel'; text: string }
  | { type: 'card'; title: string; sub?: string; tag?: string; color?: string; emoji?: string; pin?: Pin }
  | { type: 'field'; label: string; value?: string; pin?: Pin }
  | { type: 'row'; cells: string[]; strongFirst?: boolean; pin?: Pin }
  | { type: 'button'; label: string; primary?: boolean; pin?: Pin }
  | { type: 'note'; text: string }
  | { type: 'bigNumber'; label: string; value: string; pin?: Pin }

export interface ScreenSpec {
  chrome?: 'browser' | 'phone'
  url?: string
  nav?: string                                   // active sidebar label (browser only)
  screenTitle?: string                           // phone header title
  header?: { title: string; subtitle?: string; button?: { label: string; pin?: Pin } }
  tabs?: { label: string; active?: boolean; pin?: Pin }[]
  chips?: { label: string; active?: boolean; pin?: Pin }[]
  band?: { label: string; value: string; pin?: Pin }[]
  columns?: number
  items?: ShotItem[]
  tableHead?: string[]
  caption?: string
  height?: number
}

const NAV = [
  { section: null, items: [
    { label: 'Home', icon: LayoutDashboard },
    { label: 'Transactions', icon: ArrowLeftRight },
    { label: 'Accounts', icon: Wallet },
    { label: 'Insights', icon: Target },
  ] },
  { section: 'SALES & PURCHASES', items: [
    { label: 'Customers', icon: Users },
    { label: 'Suppliers', icon: Building2 },
  ] },
  { section: 'TEAM', items: [
    { label: 'Payroll', icon: CalendarClock },
    { label: 'Organization', icon: Building2 },
  ] },
  { section: 'SYSTEM', items: [
    { label: 'Setup', icon: Wrench },
    { label: 'Guide', icon: BookOpen },
  ] },
]

// numbered pin badge that sits on the top-left corner of the element it marks
function PinBadge({ n }: { n: number }) {
  return (
    <span style={{ position: 'absolute', top: -9, left: -9, zIndex: 6, width: 20, height: 20, borderRadius: '50%', background: '#E8543C', color: '#fff', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 6px rgba(0,0,0,.28), 0 0 0 2px var(--surface)' }}>{n}</span>
  )
}
function ringStyle(on: boolean): React.CSSProperties {
  return on ? { boxShadow: '0 0 0 2px #E8543C, 0 0 0 6px color-mix(in srgb, #E8543C 22%, transparent)', borderRadius: 11 } : {}
}
function Pinned({ pin, children, radius = 11 }: { pin?: Pin; children: React.ReactNode; radius?: number }) {
  if (!pin) return <>{children}</>
  return (
    <span style={{ position: 'relative', display: 'block', ...ringStyle(true), borderRadius: radius }}>
      <PinBadge n={pin.n} />
      {children}
    </span>
  )
}

function Sidebar({ active }: { active?: string }) {
  return (
    <div style={{ width: 150, flexShrink: 0, background: 'var(--surface)', borderRight: '1px solid var(--border)', padding: '12px 10px', display: 'flex', flexDirection: 'column', gap: 2 }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text)', padding: '2px 8px 12px', letterSpacing: '-.02em' }}>Vaultr</div>
      {NAV.map((grp, gi) => (
        <div key={gi}>
          {grp.section && <p style={{ fontSize: 8, fontWeight: 800, letterSpacing: '.12em', color: 'var(--text-faint)', padding: '10px 8px 4px' }}>{grp.section}</p>}
          {grp.items.map(it => {
            const on = it.label === active
            const Icon = it.icon
            return (
              <div key={it.label} style={{ position: 'relative' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 8px', borderRadius: 8, background: on ? 'var(--brand-light)' : 'transparent', color: on ? 'var(--brand)' : 'var(--text-muted)', fontSize: 11.5, fontWeight: on ? 700 : 600, ...(on ? ringStyle(false) : {}) }}>
                  <Icon className="w-[13px] h-[13px]" style={{ flexShrink: 0 }} /> {it.label}
                </div>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

function PrimaryButton({ label, pin }: { label: string; pin?: Pin }) {
  return (
    <Pinned pin={pin} radius={9}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'var(--brand)', color: '#fff', fontSize: 11, fontWeight: 700, padding: '7px 12px', borderRadius: 9 }}>
        <Plus className="w-[13px] h-[13px]" /> {label.replace(/^\+\s*/, '')}
      </span>
    </Pinned>
  )
}

function ItemView({ it, cols }: { it: ShotItem; cols: number }) {
  switch (it.type) {
    case 'groupLabel':
      return <p style={{ gridColumn: `1 / -1`, fontSize: 9, fontWeight: 800, letterSpacing: '.1em', color: 'var(--text-faint)', margin: '6px 0 2px' }}>{it.text.toUpperCase()}</p>
    case 'note':
      return <p style={{ gridColumn: '1 / -1', fontSize: 11, color: 'var(--text-muted)' }}>{it.text}</p>
    case 'card':
      return (
        <Pinned pin={it.pin}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 11, padding: '11px 13px' }}>
            <span style={{ width: 28, height: 28, borderRadius: 8, background: it.color ? `color-mix(in srgb, ${it.color} 16%, transparent)` : 'var(--brand-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>{it.emoji ?? ''}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', margin: 0 }}>{it.title}</p>
              {it.sub && <p style={{ fontSize: 10, color: 'var(--text-faint)', margin: '1px 0 0' }}>{it.sub}</p>}
            </div>
            {it.tag && <span style={{ fontSize: 9.5, fontWeight: 700, color: it.color ?? 'var(--brand)', background: it.color ? `color-mix(in srgb, ${it.color} 14%, transparent)` : 'var(--brand-light)', padding: '3px 7px', borderRadius: 6 }}>{it.tag}</span>}
          </div>
        </Pinned>
      )
    case 'field':
      return (
        <div style={{ gridColumn: '1 / -1' }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', margin: '0 0 4px' }}>{it.label}</p>
          <Pinned pin={it.pin} radius={9}>
            <div style={{ height: 32, borderRadius: 9, background: 'var(--surface-2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', padding: '0 11px', fontSize: 11.5, color: it.value ? 'var(--text)' : 'var(--text-faint)' }}>{it.value ?? ''}</div>
          </Pinned>
        </div>
      )
    case 'button':
      return (
        <div style={{ gridColumn: '1 / -1', display: 'flex' }}>
          {it.primary ? <PrimaryButton label={it.label} pin={it.pin} /> : (
            <Pinned pin={it.pin} radius={9}>
              <span style={{ display: 'inline-flex', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', padding: '7px 12px', borderRadius: 9, border: '1px solid var(--border)' }}>{it.label}</span>
            </Pinned>
          )}
        </div>
      )
    case 'bigNumber':
      return (
        <Pinned pin={it.pin}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px' }}>
            <p style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.08em', color: 'var(--text-faint)', textTransform: 'uppercase', margin: 0 }}>{it.label}</p>
            <p style={{ fontSize: 17, fontWeight: 800, color: 'var(--text)', margin: '3px 0 0' }}>{it.value}</p>
          </div>
        </Pinned>
      )
    case 'row':
      return (
        <Pinned pin={it.pin} radius={9}>
          <div style={{ display: 'grid', gridTemplateColumns: `1.5fr repeat(${Math.max(1, it.cells.length - 1)}, 1fr)`, gap: 10, alignItems: 'center', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 9, background: 'var(--surface)' }}>
            {it.cells.map((c, i) => <span key={i} style={{ fontSize: 11, color: i === 0 ? 'var(--text)' : 'var(--text-muted)', fontWeight: i === 0 && it.strongFirst ? 700 : 500, textAlign: i === 0 ? 'left' : 'right' }}>{c}</span>)}
          </div>
        </Pinned>
      )
  }
}

function collectPins(spec: ScreenSpec): Pin[] {
  const out: Pin[] = []
  const add = (p?: Pin) => { if (p) out.push(p) }
  add(spec.header?.button?.pin)
  spec.tabs?.forEach(t => add(t.pin))
  spec.chips?.forEach(c => add(c.pin))
  spec.band?.forEach(b => add(b.pin))
  spec.items?.forEach(i => 'pin' in i && add((i as { pin?: Pin }).pin))
  return out.sort((a, b) => a.n - b.n)
}

export default function GuideShot({ spec }: { spec: ScreenSpec }) {
  const chrome = spec.chrome ?? 'browser'
  const cols = spec.columns ?? 1
  const pins = collectPins(spec)

  const Content = (
    <div style={{ flex: 1, minWidth: 0, padding: 16, overflow: 'hidden' }}>
      {spec.header && (
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)', letterSpacing: '-.01em' }}>{spec.header.title}</div>
            {spec.header.subtitle && <div style={{ fontSize: 10.5, color: 'var(--text-faint)', marginTop: 2 }}>{spec.header.subtitle}</div>}
          </div>
          {spec.header.button && <PrimaryButton label={spec.header.button.label} pin={spec.header.button.pin} />}
        </div>
      )}
      {spec.band && (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${spec.band.length}, 1fr)`, gap: 10, marginBottom: 12 }}>
          {spec.band.map((b, i) => (
            <Pinned key={i} pin={b.pin}>
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '11px 13px' }}>
                <p style={{ fontSize: 9, fontWeight: 800, letterSpacing: '.08em', color: 'var(--text-faint)', textTransform: 'uppercase', margin: 0 }}>{b.label}</p>
                <p style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)', margin: '3px 0 0' }}>{b.value}</p>
              </div>
            </Pinned>
          ))}
        </div>
      )}
      {spec.tabs && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
          {spec.tabs.map((t, i) => (
            <Pinned key={i} pin={t.pin} radius={8}>
              <span style={{ fontSize: 10.5, fontWeight: 700, padding: '5px 11px', borderRadius: 8, background: t.active ? 'var(--brand)' : 'var(--surface)', color: t.active ? '#fff' : 'var(--text-muted)', border: t.active ? 'none' : '1px solid var(--border)', display: 'inline-block' }}>{t.label}</span>
            </Pinned>
          ))}
        </div>
      )}
      {spec.chips && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
          {spec.chips.map((c, i) => (
            <Pinned key={i} pin={c.pin} radius={8}>
              <span style={{ fontSize: 10.5, fontWeight: 700, padding: '5px 11px', borderRadius: 8, background: c.active ? 'var(--brand)' : 'var(--surface)', color: c.active ? '#fff' : 'var(--text-muted)', border: c.active ? 'none' : '1px solid var(--border)', display: 'inline-block' }}>{c.label}</span>
            </Pinned>
          ))}
        </div>
      )}
      {spec.tableHead && (
        <div style={{ display: 'grid', gridTemplateColumns: `1.5fr repeat(${Math.max(1, spec.tableHead.length - 1)}, 1fr)`, gap: 10, padding: '8px 12px', background: 'var(--surface-2)', borderRadius: '9px 9px 0 0', border: '1px solid var(--border)', fontSize: 9, fontWeight: 800, letterSpacing: '.06em', color: 'var(--text-faint)' }}>
          {spec.tableHead.map((h, i) => <span key={i} style={{ textAlign: i === 0 ? 'left' : 'right' }}>{h}</span>)}
        </div>
      )}
      {spec.items && (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 8 }}>
          {spec.items.map((it, i) => <ItemView key={i} it={it} cols={cols} />)}
        </div>
      )}
    </div>
  )

  const inner = chrome === 'browser'
    ? <div style={{ display: 'flex', background: 'var(--bg)', minHeight: spec.height ?? 300 }}>{spec.nav && <Sidebar active={spec.nav} />}{Content}</div>
    : <div style={{ background: 'var(--bg)', minHeight: spec.height ?? 380 }}>
        <div style={{ padding: '8px 16px 4px', display: 'flex', justifyContent: 'space-between', fontSize: 10, fontWeight: 700, color: 'var(--text)' }}><span>9:41</span><span>▪ ▪ ▪</span></div>
        {spec.screenTitle && <div style={{ padding: '4px 16px 8px', fontSize: 18, fontWeight: 800, color: 'var(--text)' }}>{spec.screenTitle}</div>}
        {Content}
      </div>

  return (
    <figure style={{ margin: '18px 0', maxWidth: chrome === 'phone' ? 320 : 620 }}>
      <div style={{ borderRadius: chrome === 'phone' ? 28 : 14, overflow: 'hidden', border: chrome === 'phone' ? '8px solid var(--text)' : '1px solid var(--border)', boxShadow: 'var(--shadow-lg)', background: 'var(--surface)' }}>
        {chrome === 'browser' && (
          <div style={{ height: 30, background: 'var(--surface-2)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 6, padding: '0 12px' }}>
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#E86A5E' }} />
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#E8C15E' }} />
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#7BC47F' }} />
            <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 7, padding: '3px 12px', fontSize: 9.5, color: 'var(--text-faint)' }}>
                <Lock className="w-[9px] h-[9px]" /> app.vaultr.money{spec.url ?? ''}
              </div>
            </div>
          </div>
        )}
        {inner}
      </div>

      {pins.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', marginTop: 10, padding: '0 2px' }}>
          {pins.map(p => (
            <span key={p.n} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--text-muted)' }}>
              <span style={{ width: 17, height: 17, borderRadius: '50%', background: '#E8543C', color: '#fff', fontSize: 10, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{p.n}</span>
              {p.label}
            </span>
          ))}
        </div>
      )}
      {spec.caption && <figcaption style={{ fontSize: 11.5, color: 'var(--text-faint)', marginTop: 8 }}>{spec.caption}</figcaption>}
    </figure>
  )
}
