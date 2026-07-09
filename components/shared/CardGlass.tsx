import { deriveCardColors } from '@/lib/card-gradient'

/**
 * The two translucent facet planes of the "30a / Diagonal glass" card.
 * Drop these as the FIRST children of a `position:relative; overflow:hidden`
 * container whose background is `cardFaceGradient(base)`, then give the real
 * content `position:relative` so it paints above the glass.
 */
export default function CardGlass({ base }: { base: string }) {
  const { c2, c3 } = deriveCardColors(base)
  return (
    <>
      <div
        aria-hidden
        style={{
          position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0,
          background: `linear-gradient(120deg, ${c2}, ${c3})`,
          clipPath: 'polygon(0 0, 58% 0, 30% 100%, 0 100%)',
          opacity: 0.5,
        }}
      />
      <div
        aria-hidden
        style={{
          position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0,
          background: `linear-gradient(200deg, ${c3}, transparent)`,
          clipPath: 'polygon(58% 0, 100% 0, 100% 42%, 30% 100%)',
          opacity: 0.35,
        }}
      />
    </>
  )
}
