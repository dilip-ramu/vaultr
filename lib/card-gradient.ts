/**
 * Card gradient helper — the "30a / Diagonal glass" look.
 *
 * A single chosen colour (e.g. the account's blue, or a red credit card) is
 * expanded into a same-hue TRIAD that accentuates itself:
 *   c1 — deep/dark tone   (gradient base, keeps text legible)
 *   c2 — the chosen mid tone
 *   c3 — light/tint tone   (the highlight facet)
 *
 * Because all three share the base hue, "blue in → 3 blues out",
 * "red in → 3 reds out" automatically. Used by both the on-screen card face
 * and the downloadable (canvas) share card so they stay identical.
 */

export interface CardColors {
  c1: string // dark
  c2: string // mid (the chosen colour)
  c3: string // light
}

/* ── colour math ──────────────────────────────────────────────── */

function parseHex(hex: string): [number, number, number] | null {
  if (!hex) return null
  let h = hex.trim().replace(/^#/, '')
  if (h.length === 3) h = h.split('').map(c => c + c).join('')
  if (h.length !== 6 || /[^0-9a-fA-F]/.test(h)) return null
  const n = parseInt(h, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const l = (max + min) / 2
  let h = 0, s = 0
  const d = max - min
  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break
      case g: h = (b - r) / d + 2; break
      default: h = (r - g) / d + 4
    }
    h /= 6
  }
  return [h * 360, s, l]
}

function hslToHex(h: number, s: number, l: number): string {
  h = ((h % 360) + 360) % 360 / 360
  s = Math.min(1, Math.max(0, s))
  l = Math.min(1, Math.max(0, l))
  const hue = (p: number, q: number, t: number) => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  let r: number, g: number, b: number
  if (s === 0) { r = g = b = l }
  else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s
    const p = 2 * l - q
    r = hue(p, q, h + 1 / 3); g = hue(p, q, h); b = hue(p, q, h - 1 / 3)
  }
  const to = (x: number) => Math.round(x * 255).toString(16).padStart(2, '0')
  return `#${to(r)}${to(g)}${to(b)}`
}

/**
 * Expand a base colour into the {c1,c2,c3} triad.
 * c2 preserves the chosen colour exactly; c1 and c3 are same-hue dark/light
 * accents. Lightness targets are clamped so even a very light or very dark
 * input still yields a readable dark→mid→light card.
 */
export function deriveCardColors(base: string): CardColors {
  const rgb = parseHex(base)
  // Fallback for CSS vars / unparseable input: a neutral slate triad.
  if (!rgb) return { c1: '#1e293b', c2: base || '#334155', c3: '#94a3b8' }

  const [h, s0, l] = rgbToHsl(...rgb)
  const s = Math.max(s0, 0.32) // ensure some tint so greys still read as a hue

  const c1 = hslToHex(h, Math.min(s + 0.06, 1), Math.min(l * 0.45, 0.24))
  const c2 = base
  const c3 = hslToHex(h, Math.min(s + 0.10, 1), Math.max(l, 0.78))
  return { c1, c2, c3 }
}

/** The base gradient for the card face (behind the glass facets). */
export function cardFaceGradient(base: string): string {
  const { c1, c2 } = deriveCardColors(base)
  return `linear-gradient(140deg, ${c1}, ${c2})`
}

const FALLBACK_PALETTE = [
  '#6366F1', '#10B981', '#F59E0B', '#8B5CF6',
  '#3B82F6', '#EF4444', '#EC4899', '#14B8A6',
  '#F97316', '#84CC16', '#06B6D4', '#A16207',
] as const

/**
 * Stable accent for a card whose colour hasn't been chosen yet: hashes a seed
 * (e.g. the row id) to a palette entry so a directory looks varied but each
 * card keeps the same colour across reloads. Pass the user's chosen hex to
 * override.
 */
export function autoColor(seed: string, chosen?: string | null, palette: readonly string[] = FALLBACK_PALETTE): string {
  if (chosen) return chosen
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return palette[h % palette.length]
}
