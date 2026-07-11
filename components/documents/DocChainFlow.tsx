import Link from 'next/link'
import type { ChainNode } from '@/lib/documents/chain'

const COLORS: Record<ChainNode['status'], string> = {
  done:    '#3faf57',   // green — completed
  current: '#f0b429',   // amber — being worked on
  pending: '#e05252',   // red — not created yet
}

// Interlocking chevron: notch on the left, point on the right.
const CLIP = 'polygon(0 0, calc(100% - 20px) 0, 100% 50%, calc(100% - 20px) 100%, 0 100%, 20px 50%)'
const CLIP_FIRST = 'polygon(0 0, calc(100% - 20px) 0, 100% 50%, calc(100% - 20px) 100%, 0 100%)'

/** Zoho-style document chain ribbon. Each stage is a coloured chevron; existing
 *  stages (except the current one) link straight to that document. */
export default function DocChainFlow({ nodes }: { nodes: ChainNode[] }) {
  return (
    // On a phone the chevrons stay full size and the strip scrolls sideways —
    // squashing five stages into 380px makes every label illegible.
    <div className="-mx-4 px-4 md:mx-0 md:px-0 overflow-x-auto no-scrollbar">
      <div className="flex items-stretch w-full select-none min-w-[560px] md:min-w-0" style={{ minHeight: 46 }}>
      {nodes.map((n, i) => {
        const bg = COLORS[n.status]
        const inner = (
          <div
            className="flex items-center justify-center text-center h-full w-full text-white font-bold"
            style={{
              background: bg,
              clipPath: i === 0 ? CLIP_FIRST : CLIP,
              paddingLeft: i === 0 ? 16 : 30,
              paddingRight: 22,
              fontSize: 12.5,
              letterSpacing: '.01em',
              opacity: n.status === 'pending' ? 0.9 : 1,
              boxShadow: n.status === 'current' ? 'inset 0 0 0 2px rgba(0,0,0,.12)' : 'none',
            }}
          >
            <span className="flex flex-col items-center leading-tight">
              <span>{n.label}</span>
              {n.note && <span style={{ fontSize: 9.5, fontWeight: 700, opacity: 0.92 }}>{n.note}</span>}
            </span>
          </div>
        )
        return (
          <div key={n.key} className="flex-1 relative" style={{ marginLeft: i === 0 ? 0 : -18, zIndex: nodes.length - i }} title={n.status}>
            {n.href ? <Link href={n.href} className="block h-full">{inner}</Link> : inner}
          </div>
        )
      })}
      </div>
    </div>
  )
}
