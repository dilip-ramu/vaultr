'use client'

import { useMemo, useState } from 'react'
import {
  Rocket, ArrowLeftRight, Wallet, BarChart3, Users, Building2, CalendarClock,
  FileText, Settings, Layers, ChevronDown, ChevronRight, ChevronLeft, Search,
  ThumbsUp, ThumbsDown, Check, BookOpen, Info, Lightbulb, AlertTriangle, ArrowUpRight,
} from 'lucide-react'
import { GUIDE, type Topic, type Article, type Block } from '@/lib/guide/content'
import GuideFigure from './GuideFigure'

const ICONS: Record<string, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
  rocket: Rocket, 'arrow-left-right': ArrowLeftRight, wallet: Wallet, 'bar-chart-3': BarChart3,
  users: Users, 'building-2': Building2, 'calendar-clock': CalendarClock, 'file-text': FileText,
  settings: Settings, layers: Layers,
}
function TopicIcon({ name, className, style }: { name: string; className?: string; style?: React.CSSProperties }) {
  const C = ICONS[name] ?? BookOpen
  return <C className={className} style={style} />
}

// ── Block renderer ────────────────────────────────────────────────────────────
function Inline({ text }: { text: string }) {
  // tiny formatter: `code` and **bold**
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean)
  return (
    <>
      {parts.map((p, i) => {
        if (p.startsWith('**') && p.endsWith('**')) return <strong key={i} style={{ fontWeight: 700, color: 'var(--text)' }}>{p.slice(2, -2)}</strong>
        if (p.startsWith('`') && p.endsWith('`')) return <code key={i} style={{ fontFamily: 'ui-monospace, monospace', fontSize: '.85em', fontWeight: 700, background: 'var(--surface-2)', border: '1px solid var(--border)', padding: '1px 6px', borderRadius: 5 }}>{p.slice(1, -1)}</code>
        return <span key={i}>{p}</span>
      })}
    </>
  )
}

const CALLOUT = {
  tip:  { icon: Lightbulb, color: 'var(--brand)' },
  info: { icon: Info, color: 'var(--brand)' },
  warn: { icon: AlertTriangle, color: 'var(--amber, #B4530F)' },
} as const

function BlockView({ block }: { block: Block }) {
  switch (block.t) {
    case 'lead':
      return <p style={{ fontSize: 15, lineHeight: 1.7, color: 'var(--text-muted)', margin: '0 0 4px', maxWidth: 620 }}><Inline text={block.text} /></p>
    case 'p':
      return <p style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--text-muted)', margin: '14px 0 0', maxWidth: 620 }}><Inline text={block.text} /></p>
    case 'h':
      return <h2 id={block.id} style={{ fontSize: 19, fontWeight: 800, color: 'var(--text)', margin: '30px 0 12px', letterSpacing: '-.01em', scrollMarginTop: 80 }}>{block.text}</h2>
    case 'list':
      return (
        <ul style={{ margin: '14px 0 0', padding: 0, listStyle: 'none', maxWidth: 620, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {block.items.map((it, i) => (
            <li key={i} style={{ display: 'flex', gap: 10, fontSize: 14, lineHeight: 1.6, color: 'var(--text-muted)' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--brand)', flexShrink: 0, marginTop: 8 }} />
              <span><Inline text={it} /></span>
            </li>
          ))}
        </ul>
      )
    case 'steps':
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, margin: '16px 0 0', maxWidth: 620 }}>
          {block.items.map((s, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '14px 16px' }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--brand)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12.5, fontWeight: 800, flexShrink: 0 }}>{i + 1}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)', margin: 0 }}>{s.title}</p>
                {s.detail && <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: '2px 0 0' }}><Inline text={s.detail} /></p>}
              </div>
              {s.action && <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 700, color: 'var(--brand)', whiteSpace: 'nowrap', flexShrink: 0 }}>{s.action} <ArrowUpRight className="w-3 h-3" /></span>}
            </div>
          ))}
        </div>
      )
    case 'callout': {
      const c = CALLOUT[block.variant]
      const Icon = c.icon
      return (
        <div style={{ display: 'flex', gap: 12, background: 'var(--brand-light)', border: `1px solid color-mix(in srgb, ${c.color} 22%, transparent)`, borderRadius: 14, padding: '14px 16px', margin: '20px 0 0', maxWidth: 620 }}>
          <Icon className="w-[18px] h-[18px]" style={{ color: c.color, flexShrink: 0, marginTop: 1 }} />
          <div>
            {block.title && <p style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)', margin: 0 }}>{block.title}</p>}
            <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: block.title ? '2px 0 0' : 0 }}><Inline text={block.text} /></p>
          </div>
        </div>
      )
    }
    case 'figure':
      return <GuideFigure spec={block.fig} />
    case 'faq':
      return (
        <div style={{ margin: '16px 0 0', maxWidth: 620, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {block.items.map((f, i) => (
            <div key={i} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: '13px 15px' }}>
              <p style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)', margin: 0 }}>{f.q}</p>
              <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: '4px 0 0' }}><Inline text={f.a} /></p>
            </div>
          ))}
        </div>
      )
  }
}

// ── Article view ────────────────────────────────────────────────────────────
function ArticleView({ topic, article, onNav }: { topic: Topic; article: Article; onNav: (articleId: string) => void }) {
  const headings = article.blocks.filter((b): b is Extract<Block, { t: 'h' }> => b.t === 'h')
  // flatten articles for prev/next
  const flat = topic.groups.flatMap(g => g.articles)
  const idx = flat.findIndex(a => a.id === article.id)
  const next = idx >= 0 && idx < flat.length - 1 ? flat[idx + 1] : null

  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'flex-start', minWidth: 0 }}>
      <div style={{ flex: 1, minWidth: 0, padding: '36px 44px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11.5, color: 'var(--text-faint)', marginBottom: 14 }}>
          <span>{topic.label}</span><ChevronRight className="w-3 h-3" /><span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>{article.title}</span>
        </div>
        <h1 style={{ fontSize: 30, fontWeight: 800, color: 'var(--text)', letterSpacing: '-.02em', margin: 0 }}>{article.title}</h1>
        {article.subtitle && <p style={{ fontSize: 14, color: 'var(--text-faint)', margin: '6px 0 0' }}>{article.subtitle}</p>}
        <div style={{ marginTop: 18 }}>
          {article.blocks.map((b, i) => <BlockView key={i} block={b} />)}
        </div>

        {next && (
          <button onClick={() => onNav(next.id)} style={{ display: 'block', textAlign: 'left', width: '100%', maxWidth: 620, marginTop: 30, paddingTop: 20, borderTop: '1px solid var(--border)', background: 'none', border: 'none', cursor: 'pointer' }}>
            <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: '13px 15px' }}>
              <p style={{ fontSize: 10, color: 'var(--text-faint)', fontWeight: 700, margin: 0 }}>NEXT</p>
              <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--brand)', margin: '2px 0 0' }}>{next.title} →</p>
            </div>
          </button>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 24 }}>
          <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: 0 }}>Was this helpful?</p>
          {[ThumbsUp, ThumbsDown].map((I, i) => (
            <button key={i} style={{ width: 34, height: 34, borderRadius: 9, background: 'var(--surface)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <I className="w-[15px] h-[15px]" style={{ color: 'var(--text-muted)' }} />
            </button>
          ))}
        </div>
      </div>

      {headings.length > 0 && (
        <div className="hidden xl:block" style={{ width: 180, flexShrink: 0, padding: '36px 20px 36px 0', position: 'sticky', top: 0, alignSelf: 'flex-start' }}>
          <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.1em', color: 'var(--text-faint)', marginBottom: 10 }}>ON THIS PAGE</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, borderLeft: '2px solid var(--border)', paddingLeft: 12 }}>
            {headings.map(h => (
              <a key={h.id} href={`#${h.id}`} style={{ fontSize: 12, color: 'var(--text-muted)', textDecoration: 'none' }}>{h.text}</a>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main ────────────────────────────────────────────────────────────────────
export default function GuideClient() {
  const [topicId, setTopicId] = useState(GUIDE[0].id)
  const topic = GUIDE.find(t => t.id === topicId) ?? GUIDE[0]
  const [articleId, setArticleId] = useState(topic.groups[0].articles[0].id)
  const [topicOpen, setTopicOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [mobileArticleOpen, setMobileArticleOpen] = useState(false)

  const article = useMemo(() => {
    const flat = topic.groups.flatMap(g => g.articles)
    return flat.find(a => a.id === articleId) ?? flat[0]
  }, [topic, articleId])

  const selectTopic = (id: string) => {
    const t = GUIDE.find(x => x.id === id)!
    setTopicId(id)
    setArticleId(t.groups[0].articles[0].id)
    setTopicOpen(false)
  }

  // search across all topics
  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return null
    const out: { topic: Topic; article: Article }[] = []
    for (const t of GUIDE) for (const g of t.groups) for (const a of g.articles) {
      if (a.title.toLowerCase().includes(q) || (a.subtitle ?? '').toLowerCase().includes(q)) out.push({ topic: t, article: a })
    }
    return out
  }, [query])

  const TopicDropdown = (
    <div style={{ position: 'relative' }}>
      <button onClick={() => setTopicOpen(o => !o)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 9, background: 'var(--brand-light)', border: '1px solid color-mix(in srgb, var(--brand) 28%, transparent)', borderRadius: 11, padding: '11px 13px', cursor: 'pointer' }}>
        <Layers className="w-4 h-4" style={{ color: 'var(--brand)' }} />
        <div style={{ flex: 1, textAlign: 'left' }}>
          <p style={{ fontSize: 9, fontWeight: 800, letterSpacing: '.08em', color: 'var(--brand)', margin: 0 }}>TOPIC</p>
          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', margin: 0 }}>{topic.label}</p>
        </div>
        <ChevronDown className="w-4 h-4" style={{ color: 'var(--brand)', transform: topicOpen ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
      </button>
      {topicOpen && (
        <>
          <div onClick={() => setTopicOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 20 }} />
          <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 21, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: 'var(--shadow-lg)', overflow: 'hidden', maxHeight: 360, overflowY: 'auto' }}>
            {GUIDE.map(t => (
              <button key={t.id} onClick={() => selectTopic(t.id)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', background: t.id === topicId ? 'var(--brand-light)' : 'transparent', border: 'none', borderBottom: '1px solid var(--border-2, var(--border))', cursor: 'pointer', textAlign: 'left' }}>
                <TopicIcon name={t.icon} className="w-4 h-4" style={{ color: t.id === topicId ? 'var(--brand)' : 'var(--text-muted)' }} />
                <span style={{ flex: 1, fontSize: 13, fontWeight: t.id === topicId ? 700 : 600, color: t.id === topicId ? 'var(--brand)' : 'var(--text)' }}>{t.label}</span>
                {t.id === topicId && <Check className="w-4 h-4" style={{ color: 'var(--brand)' }} />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )

  const ArticleList = searchResults ? (
    <nav style={{ flex: 1, overflowY: 'auto', padding: '4px 12px 16px' }}>
      <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.1em', color: 'var(--text-faint)', padding: '10px 10px 5px' }}>{searchResults.length} RESULT{searchResults.length !== 1 ? 'S' : ''}</p>
      {searchResults.map(({ topic: t, article: a }) => (
        <button key={t.id + a.id} onClick={() => { setQuery(''); setTopicId(t.id); setArticleId(a.id) }} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', borderRadius: 9, background: 'none', border: 'none', cursor: 'pointer' }}>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)' }}>{a.title}</span>
          <span style={{ display: 'block', fontSize: 10.5, color: 'var(--text-faint)' }}>{t.label}</span>
        </button>
      ))}
    </nav>
  ) : (
    <nav style={{ flex: 1, overflowY: 'auto', padding: '4px 12px 16px' }}>
      {topic.groups.map(g => (
        <div key={g.label}>
          <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.1em', color: 'var(--text-faint)', padding: '12px 10px 5px' }}>{g.label.toUpperCase()}</p>
          {g.articles.map(a => {
            const on = a.id === articleId
            return (
              <button key={a.id} onClick={() => setArticleId(a.id)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', borderRadius: 9, background: on ? 'var(--brand-light)' : 'transparent', color: on ? 'var(--brand)' : 'var(--text-muted)', border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: on ? 700 : 600 }}>{a.title}</button>
            )
          })}
        </div>
      ))}
    </nav>
  )

  const SearchBox = (
    <div style={{ padding: '0 16px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '9px 11px' }}>
        <Search className="w-[15px] h-[15px]" style={{ color: 'var(--text-faint)' }} />
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search the guide…" style={{ flex: 1, fontSize: 12.5, color: 'var(--text)', background: 'transparent', border: 'none', outline: 'none' }} />
      </div>
    </div>
  )

  return (
    <div className="w-full">
      {/* ── Desktop / tablet (22a) ── */}
      <div className="hidden md:flex" style={{ alignItems: 'flex-start' }}>
        <div style={{ width: 270, flexShrink: 0, borderRight: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', flexDirection: 'column', position: 'sticky', top: 0, alignSelf: 'flex-start', maxHeight: '100dvh' }}>
          <div style={{ padding: '22px 20px 14px' }}>
            <h1 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', letterSpacing: '-.02em', margin: 0 }}>Guide</h1>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 0' }}>Everything, explained</p>
          </div>
          <div style={{ padding: '0 16px 12px' }}>{TopicDropdown}</div>
          {SearchBox}
          {ArticleList}
        </div>
        <ArticleView topic={topic} article={article} onNav={setArticleId} />
      </div>

      {/* ── Mobile (22b) ── */}
      <div className="md:hidden" style={{ padding: '8px 0 24px' }}>
        {!mobileArticleOpen ? (
          <div style={{ padding: '4px 16px' }}>
            <p style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', margin: '4px 0 12px' }}>Guide</p>
            <button onClick={() => setTopicOpen(o => !o)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 9, background: 'var(--brand)', borderRadius: 12, padding: '13px 15px', border: 'none', cursor: 'pointer', marginBottom: 12 }}>
              <Layers className="w-[17px] h-[17px]" style={{ color: '#fff' }} />
              <span style={{ flex: 1, textAlign: 'left', fontSize: 14, fontWeight: 700, color: '#fff' }}>{topic.label}</span>
              <ChevronDown className="w-[17px] h-[17px]" style={{ color: '#fff', transform: topicOpen ? 'rotate(180deg)' : 'none' }} />
            </button>
            {topicOpen && (
              <div style={{ borderRadius: 14, background: 'var(--surface)', border: '1px solid var(--border)', overflow: 'hidden', marginBottom: 16 }}>
                {GUIDE.map(t => (
                  <button key={t.id} onClick={() => selectTopic(t.id)} style={{ width: '100%', padding: '12px 15px', display: 'flex', alignItems: 'center', gap: 10, background: t.id === topicId ? 'var(--brand-light)' : 'transparent', borderBottom: '1px solid var(--border-2, var(--border))', border: 'none', cursor: 'pointer' }}>
                    <TopicIcon name={t.icon} className="w-4 h-4" style={{ color: t.id === topicId ? 'var(--brand)' : 'var(--text-muted)' }} />
                    <span style={{ flex: 1, textAlign: 'left', fontSize: 13, fontWeight: t.id === topicId ? 700 : 600, color: t.id === topicId ? 'var(--brand)' : 'var(--text)' }}>{t.label}</span>
                    {t.id === topicId && <Check className="w-[15px] h-[15px]" style={{ color: 'var(--brand)' }} />}
                  </button>
                ))}
              </div>
            )}
            <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.1em', color: 'var(--text-faint)', padding: '4px 4px 8px' }}>ARTICLES IN THIS TOPIC</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {topic.groups.flatMap(g => g.articles).map(a => (
                <button key={a.id} onClick={() => { setArticleId(a.id); setMobileArticleOpen(true) }} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '13px 15px', cursor: 'pointer' }}>
                  <span style={{ flex: 1, textAlign: 'left', fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{a.title}</span>
                  <ChevronRight className="w-[15px] h-[15px]" style={{ color: 'var(--text-faint)' }} />
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div>
            <button onClick={() => setMobileArticleOpen(false)} style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '4px 16px 8px', background: 'none', border: 'none', color: 'var(--brand)', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
              <ChevronLeft className="w-4 h-4" /> {topic.label}
            </button>
            <div style={{ padding: '0 16px' }}>
              <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)', letterSpacing: '-.02em', margin: '4px 0 0' }}>{article.title}</h1>
              {article.subtitle && <p style={{ fontSize: 13, color: 'var(--text-faint)', margin: '6px 0 0' }}>{article.subtitle}</p>}
              <div style={{ marginTop: 16 }}>
                {article.blocks.map((b, i) => <BlockView key={i} block={b} />)}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
