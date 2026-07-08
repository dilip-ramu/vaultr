'use client'

/**
 * GuideFigure — an in-app-style "screenshot" illustration for the Guide.
 * Instead of pixel screenshots (which go stale), each figure is a schematic
 * of the relevant Vaultr screen drawn in the app's own tokens, with ONE
 * control highlighted (accent ring + label bubble) so a how-to step can point
 * at exactly what to click.
 *
 * It is intentionally generic: `kind` picks a layout, `highlight` is the label
 * on the circled control, `rows` are the content labels shown in the body.
 */

export type FigureKind =
  | 'listPage' | 'form' | 'wizard' | 'dashboard' | 'table' | 'detail' | 'modal' | 'setup'

export interface FigureSpec {
  kind: FigureKind
  title: string          // window / screen title
  highlight?: string     // label on the highlighted control
  caption?: string       // caption under the figure
  rows?: string[]        // content row labels
  button?: string        // primary button label (top-right), highlighted if it === highlight
  tabs?: string[]        // optional tab strip
}

const railBars = [0.5, 0.8, 0.65, 0.9, 0.55, 0.75]

function Chrome({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ borderRadius: 14, overflow: 'hidden', border: '1px solid var(--border)', boxShadow: 'var(--shadow-lg)', background: 'var(--surface)' }}>
      <div style={{ height: 30, background: 'var(--surface-2)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 6, padding: '0 12px' }}>
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#E86A5E' }} />
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#E8C15E' }} />
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#7BC47F' }} />
        <div style={{ flex: 1, textAlign: 'center', fontSize: 10, color: 'var(--text-faint)', fontWeight: 600 }}>{title}</div>
      </div>
      {children}
    </div>
  )
}

function HL({ children, on }: { children: React.ReactNode; on: boolean }) {
  if (!on) return <>{children}</>
  return (
    <span style={{ position: 'relative', display: 'inline-flex', borderRadius: 9, boxShadow: '0 0 0 2px var(--brand), 0 0 0 6px color-mix(in srgb, var(--brand) 22%, transparent)' }}>
      {children}
    </span>
  )
}

function Bubble({ text }: { text: string }) {
  return (
    <div style={{ position: 'absolute', right: 10, top: -12, transform: 'translateY(-100%)', zIndex: 5 }}>
      <div style={{ background: 'var(--brand)', color: '#fff', fontSize: 10.5, fontWeight: 700, padding: '5px 9px', borderRadius: 8, whiteSpace: 'nowrap', boxShadow: 'var(--shadow-lg)' }}>{text}</div>
      <div style={{ position: 'absolute', right: 16, bottom: -4, width: 8, height: 8, background: 'var(--brand)', transform: 'rotate(45deg)' }} />
    </div>
  )
}

function Rail() {
  return (
    <div style={{ width: 52, flexShrink: 0, borderRight: '1px solid var(--border)', background: 'var(--surface)', padding: '12px 8px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ width: 22, height: 8, borderRadius: 3, background: 'var(--border)', marginBottom: 4 }} />
      {railBars.map((w, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: i === 2 ? 'var(--brand)' : 'var(--border)' }} />
          <span style={{ height: 6, borderRadius: 3, background: i === 2 ? 'color-mix(in srgb, var(--brand) 40%, transparent)' : 'var(--border-2, var(--border))', width: `${w * 26}px` }} />
        </div>
      ))}
    </div>
  )
}

function PrimaryBtn({ label, on }: { label: string; on: boolean }) {
  return (
    <div style={{ position: 'relative' }}>
      {on && <Bubble text={label} />}
      <HL on={on}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'var(--brand)', color: '#fff', fontSize: 11, fontWeight: 700, padding: '6px 12px', borderRadius: 9 }}>
          <span style={{ fontSize: 13, lineHeight: 1 }}>+</span> {label}
        </span>
      </HL>
    </div>
  )
}

function Row({ label, highlighted }: { label: string; highlighted?: boolean }) {
  return (
    <div style={{ position: 'relative' }}>
      {highlighted && <Bubble text={label} />}
      <HL on={!!highlighted}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 11, padding: '11px 13px', width: '100%' }}>
          <span style={{ width: 26, height: 26, borderRadius: 8, background: 'color-mix(in srgb, var(--brand) 12%, transparent)', flexShrink: 0 }} />
          <span style={{ flex: 1, fontSize: 11.5, fontWeight: 600, color: 'var(--text)' }}>{label}</span>
          <span style={{ width: 34, height: 8, borderRadius: 3, background: 'var(--border)' }} />
        </div>
      </HL>
    </div>
  )
}

export default function GuideFigure({ spec }: { spec: FigureSpec }) {
  const { kind, title, highlight, caption, rows = [], button, tabs } = spec
  const btnLabel = button ?? (highlight && /add|new|create|import|\+/i.test(highlight) ? highlight : undefined)
  const btnOn = !!btnLabel && btnLabel === highlight
  // a content row can itself be the highlight target
  const rowTarget = rows.find(r => r === highlight)

  const Header = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)', letterSpacing: '-.01em' }}>{title}</div>
        <div style={{ width: 90, height: 7, borderRadius: 3, background: 'var(--border)', marginTop: 5 }} />
      </div>
      {btnLabel && <PrimaryBtn label={btnLabel} on={btnOn} />}
    </div>
  )

  const TabStrip = tabs && tabs.length > 0 && (
    <div style={{ display: 'flex', gap: 7, marginBottom: 14 }}>
      {tabs.map((t, i) => {
        const on = t === highlight
        return (
          <div key={t} style={{ position: 'relative' }}>
            {on && <Bubble text={t} />}
            <HL on={on}>
              <span style={{ fontSize: 10.5, fontWeight: 700, padding: '5px 11px', borderRadius: 8, background: i === 0 || on ? 'var(--brand)' : 'var(--surface)', color: i === 0 || on ? '#fff' : 'var(--text-muted)', border: i === 0 || on ? 'none' : '1px solid var(--border)' }}>{t}</span>
            </HL>
          </div>
        )
      })}
    </div>
  )

  let body: React.ReactNode
  if (kind === 'dashboard') {
    body = (
      <>
        {Header}
        {TabStrip}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 12 }}>
          {(rows.length ? rows : ['Balance', 'Income', 'Expense']).slice(0, 3).map(r => {
            const on = r === highlight
            return (
              <div key={r} style={{ position: 'relative' }}>
                {on && <Bubble text={r} />}
                <HL on={on}>
                  <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 13px', width: '100%' }}>
                    <div style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '.08em' }}>{r}</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)', marginTop: 4 }}>₹ ••••</div>
                  </div>
                </HL>
              </div>
            )
          })}
        </div>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, height: 78 }} />
      </>
    )
  } else if (kind === 'form' || kind === 'modal') {
    body = (
      <>
        <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)', marginBottom: 12 }}>{title}</div>
        {(rows.length ? rows : ['Name', 'Amount', 'Date', 'Category']).map(r => {
          const on = r === highlight
          return (
            <div key={r} style={{ marginBottom: 10, position: 'relative' }}>
              {on && <Bubble text={r} />}
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4 }}>{r}</div>
              <HL on={on}>
                <div style={{ height: 30, borderRadius: 9, background: 'var(--surface-2)', border: '1px solid var(--border)', width: '100%' }} />
              </HL>
            </div>
          )
        })}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', padding: '7px 14px', borderRadius: 9, border: '1px solid var(--border)' }}>Cancel</span>
          <PrimaryBtn label={btnLabel ?? 'Save'} on={(btnLabel ?? 'Save') === highlight} />
        </div>
      </>
    )
  } else if (kind === 'wizard') {
    const steps = tabs && tabs.length ? tabs : ['Details', 'Lines', 'Review']
    body = (
      <>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          {steps.map((s, i) => {
            const on = s === highlight
            return (
              <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 8, position: 'relative' }}>
                {on && <Bubble text={s} />}
                <HL on={on}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 10.5, fontWeight: 700, color: i === 0 || on ? 'var(--brand)' : 'var(--text-faint)' }}>
                    <span style={{ width: 18, height: 18, borderRadius: '50%', background: i === 0 || on ? 'var(--brand)' : 'var(--border)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 9 }}>{i + 1}</span>
                    {s}
                  </span>
                </HL>
                {i < steps.length - 1 && <span style={{ width: 20, height: 2, background: 'var(--border)' }} />}
              </div>
            )
          })}
        </div>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, height: 120 }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 14 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', padding: '7px 14px', borderRadius: 9, border: '1px solid var(--border)' }}>Back</span>
          <PrimaryBtn label={btnLabel ?? 'Next'} on={(btnLabel ?? 'Next') === highlight} />
        </div>
      </>
    )
  } else if (kind === 'setup') {
    body = (
      <div style={{ display: 'flex', gap: 0 }}>
        <div style={{ width: 120, flexShrink: 0, borderRight: '1px solid var(--border)', paddingRight: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {(rows.length ? rows : ['Company', 'Email', 'Categories', 'Account types', 'Currencies']).map(r => {
            const on = r === highlight
            return (
              <div key={r} style={{ position: 'relative' }}>
                {on && <Bubble text={r} />}
                <HL on={on}>
                  <div style={{ fontSize: 10.5, fontWeight: r === (highlight ?? rows[0] ?? 'Company') ? 700 : 600, color: r === (highlight ?? rows[0]) ? 'var(--brand)' : 'var(--text-muted)', background: r === (highlight ?? rows[0]) ? 'var(--brand-light)' : 'transparent', padding: '7px 9px', borderRadius: 8 }}>{r}</div>
                </HL>
              </div>
            )
          })}
        </div>
        <div style={{ flex: 1, paddingLeft: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)', marginBottom: 10 }}>{title}</div>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, height: 96 }} />
        </div>
      </div>
    )
  } else if (kind === 'table') {
    body = (
      <>
        {Header}
        {TabStrip}
        <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr auto', gap: 10, padding: '9px 13px', background: 'var(--surface-2)', fontSize: 9.5, fontWeight: 800, letterSpacing: '.06em', color: 'var(--text-faint)' }}>
            {(rows.length ? rows : ['NAME', 'DATE', 'AMOUNT', '']).slice(0, 4).map((h, i) => <span key={i} style={{ textAlign: i > 0 ? 'right' : 'left' }}>{h}</span>)}
          </div>
          {[0, 1, 2, 3].map(i => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr auto', gap: 10, padding: '11px 13px', borderTop: '1px solid var(--border)', alignItems: 'center' }}>
              <span style={{ height: 8, borderRadius: 3, background: 'var(--border)' }} />
              <span style={{ height: 8, borderRadius: 3, background: 'var(--border)', justifySelf: 'end', width: '60%' }} />
              <span style={{ height: 8, borderRadius: 3, background: 'var(--border)', justifySelf: 'end', width: '70%' }} />
              <span style={{ width: 16, height: 8, borderRadius: 3, background: 'var(--border)' }} />
            </div>
          ))}
        </div>
      </>
    )
  } else if (kind === 'detail') {
    body = (
      <div style={{ display: 'flex', gap: 12 }}>
        <div style={{ flex: 1.4 }}>
          {Header}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, height: 120 }} />
        </div>
        <div style={{ flex: 1, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text)', marginBottom: 8 }}>Details</div>
          {(rows.length ? rows : ['Field', 'Field', 'Field']).map((r, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderTop: i ? '1px solid var(--border)' : 'none' }}>
              <span style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>{r}</span>
              <span style={{ width: 40, height: 7, borderRadius: 3, background: 'var(--border)' }} />
            </div>
          ))}
        </div>
      </div>
    )
  } else {
    // listPage (default)
    body = (
      <>
        {Header}
        {TabStrip}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {(rows.length ? rows : ['Item one', 'Item two', 'Item three']).map(r => (
            <Row key={r} label={r} highlighted={r === rowTarget} />
          ))}
        </div>
      </>
    )
  }

  const framed = kind === 'form' || kind === 'modal' || kind === 'wizard' || kind === 'setup'

  return (
    <figure style={{ margin: '20px 0', maxWidth: 560 }}>
      <Chrome title={`app.vaultr.money · ${title}`}>
        {framed ? (
          <div style={{ background: 'var(--bg)', padding: 18 }}>
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 18, boxShadow: 'var(--shadow-lg)' }}>{body}</div>
          </div>
        ) : (
          <div style={{ display: 'flex', background: 'var(--bg)' }}>
            <Rail />
            <div style={{ flex: 1, padding: 18, minWidth: 0 }}>{body}</div>
          </div>
        )}
      </Chrome>
      {caption && <figcaption style={{ fontSize: 11.5, color: 'var(--text-faint)', marginTop: 8, textAlign: 'center' }}>{caption}</figcaption>}
    </figure>
  )
}
